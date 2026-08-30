import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { randomToken } from '@/server/crypto'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { getExamDetail } from './service'

export const admitCardRejectSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3).max(300),
})

async function studentFeeDueMinor(ctx: AppContext, studentId: string): Promise<number> {
  const agg = await ctx.db.feeInvoice.aggregate({
    where: {
      studentId,
      tenantId: ctx.tenant.id,
      status: { notIn: ['CANCELLED', 'DRAFT'] },
      balanceMinor: { gt: 0 },
    },
    _sum: { balanceMinor: true },
  })
  return agg._sum.balanceMinor ?? 0
}

async function examStudentIds(ctx: AppContext, examId: string): Promise<string[]> {
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId, tenantId: ctx.tenant.id },
    select: {
      sessionId: true,
      classes: { select: { classLevelId: true } },
    },
  })
  if (!exam) throw notFound('Exam')

  const classIds = exam.classes.map((c) => c.classLevelId)
  if (classIds.length === 0) return []

  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      tenantId: ctx.tenant.id,
      sessionId: exam.sessionId,
      classLevelId: { in: classIds },
      isCurrent: true,
      student: { deletedAt: null, status: 'ACTIVE' },
    },
    select: { studentId: true },
  })
  return [...new Set(enrollments.map((e) => e.studentId))]
}

export async function listAdmitCards(ctx: AppContext, examId: string) {
  ctx.require('exams.view')
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, status: true },
  })
  if (!exam) throw notFound('Exam')

  const rows = await ctx.db.admitCard.findMany({
    where: { examId, tenantId: ctx.tenant.id },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
          photoUrl: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: {
              classLevel: { select: { name: true } },
              section: { select: { name: true } },
              rollNumber: true,
            },
          },
        },
      },
    },
  })

  return { exam, rows }
}

export async function generateAdmitCards(ctx: AppContext, examId: string) {
  ctx.require('exams.admit_cards')

  const exam = await ctx.db.exam.findFirst({
    where: { id: examId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, status: true },
  })
  if (!exam) throw notFound('Exam')
  if (exam.status === 'ARCHIVED') throw conflict('Cannot issue admit cards for an archived exam')

  const studentIds = await examStudentIds(ctx, examId)
  if (studentIds.length === 0) {
    throw conflict('No active students are enrolled in the classes for this exam')
  }

  const existing = await ctx.db.admitCard.findMany({
    where: { examId, tenantId: ctx.tenant.id },
    select: { studentId: true },
  })
  const have = new Set(existing.map((r) => r.studentId))
  const toCreate = studentIds.filter((id) => !have.has(id))

  if (toCreate.length === 0) {
    return { created: 0, total: existing.length }
  }

  const dues = await Promise.all(toCreate.map((id) => studentFeeDueMinor(ctx, id)))
  const issuedOn = new Date()
  const sessionLabel = financialYearLabel(issuedOn)

  let created = 0
  await ctx.db.$transaction(async (tx) => {
    for (let i = 0; i < toCreate.length; i++) {
      const studentId = toCreate[i]!
      const feeDueMinor = dues[i] ?? 0
      const number = await nextDocumentNumber(tx, {
        tenantId: ctx.tenant.id,
        kind: 'ADMIT_CARD',
        sessionLabel,
      })
      await tx.admitCard.create({
        data: {
          tenantId: ctx.tenant.id,
          examId,
          studentId,
          number,
          feeDueMinor,
          verifyToken: randomToken(24),
          issuedById: ctx.user.userId,
        },
      })
      created++
    }
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'admit_card.generate',
    module: 'exams',
    entityType: 'Exam',
    entityId: examId,
    summary: `Generated ${created} admit cards for ${exam.name}`,
  })

  return { created, total: existing.length + created }
}

export async function approveAdmitCard(ctx: AppContext, id: string) {
  ctx.require('exams.admit_approve')

  const card = await ctx.db.admitCard.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      exam: { select: { name: true } },
      student: { select: { firstName: true, lastName: true } },
    },
  })
  if (!card) throw notFound('Admit card')
  if (card.status === 'APPROVED') return card

  const feeDueMinor = await studentFeeDueMinor(ctx, card.studentId)
  if (feeDueMinor > 0) {
    throw conflict(
      `Fees are not fully paid (outstanding ${(feeDueMinor / 100).toFixed(2)}). Clear dues before approving.`,
    )
  }

  const updated = await ctx.db.admitCard.update({
    where: { id },
    data: {
      status: 'APPROVED',
      feeDueMinor: 0,
      approvedById: ctx.user.userId,
      approvedAt: new Date(),
      rejectedReason: null,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'admit_card.approve',
    module: 'exams',
    entityType: 'AdmitCard',
    entityId: id,
    summary: `Approved admit card ${card.number} for ${card.student.firstName} ${card.student.lastName} (${card.exam.name})`,
  })

  return updated
}

export async function rejectAdmitCard(
  ctx: AppContext,
  input: z.infer<typeof admitCardRejectSchema>,
) {
  ctx.require('exams.admit_approve')
  const parsed = admitCardRejectSchema.parse(input)

  const card = await ctx.db.admitCard.findFirst({
    where: { id: parsed.id, tenantId: ctx.tenant.id },
    include: {
      exam: { select: { name: true } },
      student: { select: { firstName: true, lastName: true } },
    },
  })
  if (!card) throw notFound('Admit card')

  const updated = await ctx.db.admitCard.update({
    where: { id: parsed.id },
    data: {
      status: 'REJECTED',
      rejectedReason: parsed.reason,
      approvedById: ctx.user.userId,
      approvedAt: new Date(),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'admit_card.reject',
    module: 'exams',
    entityType: 'AdmitCard',
    entityId: parsed.id,
    summary: `Rejected admit card ${card.number} for ${card.student.firstName} ${card.student.lastName}`,
  })

  return updated
}

/** Undo a mistaken approval — returns the card to pending for re-review. */
export async function revokeAdmitCardApproval(ctx: AppContext, id: string) {
  ctx.require('exams.admit_approve')

  const card = await ctx.db.admitCard.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      exam: { select: { name: true } },
      student: { select: { firstName: true, lastName: true } },
    },
  })
  if (!card) throw notFound('Admit card')
  if (card.status !== 'APPROVED') {
    throw conflict('Only approved admit cards can be rolled back to pending')
  }

  const feeDueMinor = await studentFeeDueMinor(ctx, card.studentId)

  const updated = await ctx.db.admitCard.update({
    where: { id },
    data: {
      status: 'PENDING',
      approvedById: null,
      approvedAt: null,
      rejectedReason: null,
      feeDueMinor,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'admit_card.revoke',
    module: 'exams',
    entityType: 'AdmitCard',
    entityId: id,
    summary: `Rolled back approval for admit card ${card.number} (${card.student.firstName} ${card.student.lastName})`,
    before: card,
    after: updated,
  })

  return updated
}

export async function refreshAdmitCardFees(ctx: AppContext, examId: string) {
  ctx.require('exams.admit_cards')

  const cards = await ctx.db.admitCard.findMany({
    where: { examId, tenantId: ctx.tenant.id, status: 'PENDING' },
    select: { id: true, studentId: true },
  })

  for (const card of cards) {
    const feeDueMinor = await studentFeeDueMinor(ctx, card.studentId)
    await ctx.db.admitCard.update({
      where: { id: card.id },
      data: { feeDueMinor },
    })
  }

  return { updated: cards.length }
}

export async function getAdmitCardPrint(ctx: AppContext, id: string) {
  ctx.require('exams.view')

  const card = await ctx.db.admitCard.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      exam: {
        include: {
          session: { select: { name: true } },
          classes: {
            include: { classLevel: { select: { id: true, name: true } } },
          },
          subjects: {
            orderBy: [
              { examDate: 'asc' },
              { startTime: 'asc' },
              { classSubject: { subject: { name: 'asc' } } },
            ],
            include: {
              classSubject: {
                select: {
                  classLevelId: true,
                  subject: { select: { name: true, code: true } },
                  classLevel: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
          photoUrl: true,
          dateOfBirth: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: {
              classLevel: { select: { id: true, name: true } },
              section: { select: { name: true } },
              rollNumber: true,
            },
          },
        },
      },
    },
  })
  if (!card) throw notFound('Admit card')

  const enrollment = card.student.enrollments[0]
  const classLevelId = enrollment?.classLevel.id

  const dateSheet = classLevelId
    ? card.exam.subjects.filter((p) => p.classSubject.classLevelId === classLevelId)
    : card.exam.subjects

  const school = await ctx.db.school.findFirst({
    where: { tenantId: ctx.tenant.id },
    select: { name: true, addressLine1: true, city: true, state: true },
  })

  return {
    card,
    schoolName: school?.name ?? ctx.tenant.school?.name ?? ctx.tenant.name,
    schoolAddress: [school?.addressLine1, school?.city, school?.state].filter(Boolean).join(', '),
    className: enrollment
      ? `${enrollment.classLevel.name}${enrollment.section ? ` · ${enrollment.section.name}` : ''}`
      : '—',
    rollNumber: enrollment?.rollNumber != null ? String(enrollment.rollNumber) : '—',
    dateSheet,
    canPrint: card.status === 'APPROVED' || ctx.can('exams.admit_approve'),
  }
}

export async function getAdmitCardSummary(ctx: AppContext, examId: string) {
  ctx.require('exams.view')
  await getExamDetail(ctx, examId)

  const [pending, approved, rejected, total] = await Promise.all([
    ctx.db.admitCard.count({ where: { examId, status: 'PENDING' } }),
    ctx.db.admitCard.count({ where: { examId, status: 'APPROVED' } }),
    ctx.db.admitCard.count({ where: { examId, status: 'REJECTED' } }),
    ctx.db.admitCard.count({ where: { examId } }),
  ])

  return { pending, approved, rejected, total }
}
