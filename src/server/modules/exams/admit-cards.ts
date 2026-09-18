import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { randomToken } from '@/server/crypto'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { assertStudentAccess, isPortalOnlyRole, studentIdScopeWhere } from '@/server/scope'
import { getExamDetail } from './service'
import { classSubjectAppliesToSection } from './section-subjects'

export const admitCardRejectSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3).max(300),
})

export const admitCardApproveSchema = z.object({
  id: z.string().min(1),
  feeOverrideReason: z.string().trim().min(3).max(300).optional(),
})

export const generateAdmitCardsSchema = z.object({
  examId: z.string().min(1),
  sectionIds: z.array(z.string().min(1)).optional(),
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

/**
 * Students who sit this exam, scoped by enrollment section and by the papers
 * that actually apply to that section.
 *
 * A student is eligible only when their current session enrollment is in an
 * exam class AND at least one exam paper applies to their section
 * (via ClassSubject → SectionSubject). Optional `sectionIds` further narrows
 * generation to selected sections.
 */
async function examEligibleStudents(
  ctx: AppContext,
  examId: string,
  sectionIds?: string[],
): Promise<{ studentIds: string[]; skippedWithoutPapers: number }> {
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId, tenantId: ctx.tenant.id },
    select: {
      sessionId: true,
      classes: { select: { classLevelId: true } },
      subjects: {
        select: {
          classSubject: {
            select: {
              classLevelId: true,
              sections: { select: { sectionId: true } },
            },
          },
        },
      },
    },
  })
  if (!exam) throw notFound('Exam')

  const classIds = exam.classes.map((c) => c.classLevelId)
  if (classIds.length === 0) return { studentIds: [], skippedWithoutPapers: 0 }

  const selectedSections = sectionIds?.length ? new Set(sectionIds) : null
  if (selectedSections) {
    const validSections = await ctx.db.section.findMany({
      where: {
        id: { in: [...selectedSections] },
        classLevelId: { in: classIds },
        deletedAt: null,
      },
      select: { id: true },
    })
    if (validSections.length !== selectedSections.size) {
      throw conflict('One or more selected sections do not belong to this exam’s classes')
    }
  }

  const papersByClass = new Map<string, string[][]>()
  for (const paper of exam.subjects) {
    const classLevelId = paper.classSubject.classLevelId
    const mapped = paper.classSubject.sections.map((row) => row.sectionId)
    const list = papersByClass.get(classLevelId) ?? []
    list.push(mapped)
    papersByClass.set(classLevelId, list)
  }

  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      tenantId: ctx.tenant.id,
      sessionId: exam.sessionId,
      classLevelId: { in: classIds },
      isCurrent: true,
      ...(selectedSections ? { sectionId: { in: [...selectedSections] } } : {}),
      student: { deletedAt: null, status: 'ACTIVE' },
    },
    select: { studentId: true, classLevelId: true, sectionId: true },
  })

  const studentIds: string[] = []
  let skippedWithoutPapers = 0
  const seen = new Set<string>()

  for (const enrollment of enrollments) {
    if (seen.has(enrollment.studentId)) continue
    seen.add(enrollment.studentId)

    const papers = papersByClass.get(enrollment.classLevelId) ?? []
    const hasPaper = papers.some((mapped) =>
      classSubjectAppliesToSection(mapped, enrollment.sectionId),
    )
    if (!hasPaper) {
      skippedWithoutPapers++
      continue
    }
    studentIds.push(enrollment.studentId)
  }

  return { studentIds, skippedWithoutPapers }
}

export async function listAdmitCardSections(ctx: AppContext, examId: string) {
  ctx.require('exams.view')
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId, tenantId: ctx.tenant.id },
    select: { classes: { select: { classLevelId: true } } },
  })
  if (!exam) throw notFound('Exam')

  const classIds = exam.classes.map((row) => row.classLevelId)
  if (classIds.length === 0) return []

  return ctx.db.section.findMany({
    where: { classLevelId: { in: classIds }, deletedAt: null },
    orderBy: [{ classLevel: { numeric: 'asc' } }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      classLevel: { select: { id: true, name: true } },
    },
  })
}

export async function listAdmitCards(ctx: AppContext, examId: string) {
  ctx.require('exams.view')
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, status: true },
  })
  if (!exam) throw notFound('Exam')

  const scope = await studentIdScopeWhere(ctx)

  const rows = await ctx.db.admitCard.findMany({
    where: { examId, tenantId: ctx.tenant.id, ...scope },
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

/** Student/parent view: admit cards for themselves / their children across exams. */
export async function listPortalAdmitCards(ctx: AppContext) {
  ctx.require('exams.view')
  if (!isPortalOnlyRole(ctx.user.roleKeys)) {
    return { rows: [] }
  }

  const scope = await studentIdScopeWhere(ctx)
  const rows = await ctx.db.admitCard.findMany({
    where: {
      tenantId: ctx.tenant.id,
      ...scope,
      exam: { status: { in: ['SCHEDULED', 'ONGOING', 'MARKS_ENTRY', 'PUBLISHED'] } },
    },
    orderBy: [{ exam: { startsOn: 'desc' } }, { createdAt: 'desc' }],
    include: {
      exam: {
        select: {
          id: true,
          name: true,
          kind: true,
          status: true,
          startsOn: true,
          endsOn: true,
        },
      },
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

  return { rows }
}

export async function generateAdmitCards(
  ctx: AppContext,
  examId: string,
  sectionIds?: string[],
) {
  ctx.require('exams.admit_cards')

  const exam = await ctx.db.exam.findFirst({
    where: { id: examId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, status: true },
  })
  if (!exam) throw notFound('Exam')
  if (exam.status === 'ARCHIVED') throw conflict('Cannot issue admit cards for an archived exam')

  const { studentIds, skippedWithoutPapers } = await examEligibleStudents(ctx, examId, sectionIds)
  if (studentIds.length === 0) {
    throw conflict(
      skippedWithoutPapers > 0
        ? 'No students in the selected sections have exam papers assigned to their section'
        : 'No active students are enrolled in the selected classes or sections for this exam',
    )
  }

  const existing = await ctx.db.admitCard.findMany({
    where: { examId, tenantId: ctx.tenant.id },
    select: { studentId: true },
  })
  const have = new Set(existing.map((r) => r.studentId))
  const toCreate = studentIds.filter((id) => !have.has(id))

  if (toCreate.length === 0) {
    return {
      created: 0,
      total: existing.length,
      eligible: studentIds.length,
      skippedWithoutPapers,
    }
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
    summary: `Generated ${created} admit cards for ${exam.name}${
      sectionIds?.length ? ` (${sectionIds.length} section${sectionIds.length === 1 ? '' : 's'})` : ''
    }`,
  })

  return {
    created,
    total: existing.length + created,
    eligible: studentIds.length,
    skippedWithoutPapers,
  }
}

export async function approveAdmitCard(
  ctx: AppContext,
  raw: z.infer<typeof admitCardApproveSchema>,
) {
  ctx.require('exams.admit_approve')
  const input = admitCardApproveSchema.parse(raw)

  const card = await ctx.db.admitCard.findFirst({
    where: { id: input.id, tenantId: ctx.tenant.id },
    include: {
      exam: { select: { name: true } },
      student: { select: { firstName: true, lastName: true } },
    },
  })
  if (!card) throw notFound('Admit card')
  if (card.status === 'APPROVED') return card

  const feeDueMinor = await studentFeeDueMinor(ctx, card.studentId)
  if (feeDueMinor > 0 && !input.feeOverrideReason) {
    throw conflict(
      `Fees are not fully paid (outstanding ${(feeDueMinor / 100).toFixed(2)}). Enter an exception reason to approve.`,
    )
  }

  const updated = await ctx.db.admitCard.update({
    where: { id: input.id },
    data: {
      status: 'APPROVED',
      feeDueMinor,
      approvedById: ctx.user.userId,
      approvedAt: new Date(),
      rejectedReason: null,
      feeOverrideReason: feeDueMinor > 0 ? input.feeOverrideReason : null,
      feeOverrideAt: feeDueMinor > 0 ? new Date() : null,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'admit_card.approve',
    module: 'exams',
    entityType: 'AdmitCard',
    entityId: input.id,
    summary: `Approved admit card ${card.number} for ${card.student.firstName} ${card.student.lastName} (${card.exam.name})${
      feeDueMinor > 0
        ? ` with fee exception: ${input.feeOverrideReason}`
        : ''
    }`,
    before: { status: card.status, feeDueMinor: card.feeDueMinor },
    after: {
      status: updated.status,
      feeDueMinor: updated.feeDueMinor,
      feeOverrideReason: updated.feeOverrideReason,
    },
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
      feeOverrideReason: null,
      feeOverrideAt: null,
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
      feeOverrideReason: null,
      feeOverrideAt: null,
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
                  id: true,
                  classLevelId: true,
                  subject: { select: { name: true, code: true } },
                  classLevel: { select: { name: true } },
                  sections: { select: { sectionId: true } },
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
            orderBy: [{ isCurrent: 'desc' }, { joinedOn: 'desc' }],
            select: {
              sessionId: true,
              isCurrent: true,
              classLevel: { select: { id: true, name: true } },
              section: { select: { id: true, name: true } },
              rollNumber: true,
            },
          },
        },
      },
    },
  })
  if (!card) throw notFound('Admit card')
  await assertStudentAccess(ctx, card.student.id)

  // Prefer the enrollment for this exam's session so the date sheet follows
  // the section that actually sat the exam, not a later placement.
  const enrollment =
    card.student.enrollments.find((row) => row.sessionId === card.exam.sessionId) ??
    card.student.enrollments.find((row) => row.isCurrent) ??
    card.student.enrollments[0]
  const classLevelId = enrollment?.classLevel.id
  const sectionId = enrollment?.section?.id

  const dateSheet = card.exam.subjects.filter((p) => {
    if (classLevelId && p.classSubject.classLevelId !== classLevelId) return false
    return classSubjectAppliesToSection(
      p.classSubject.sections.map((row) => row.sectionId),
      sectionId,
    )
  })

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

const admitCardPrintInclude = {
  exam: {
    include: {
      session: { select: { id: true, name: true } },
      classes: {
        include: { classLevel: { select: { id: true, name: true } } },
      },
      subjects: {
        orderBy: [
          { examDate: 'asc' as const },
          { startTime: 'asc' as const },
          { classSubject: { subject: { name: 'asc' as const } } },
        ],
        include: {
          classSubject: {
            select: {
              id: true,
              classLevelId: true,
              subject: { select: { name: true, code: true } },
              classLevel: { select: { name: true } },
              sections: { select: { sectionId: true } },
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
        orderBy: [{ isCurrent: 'desc' as const }, { joinedOn: 'desc' as const }],
        select: {
          sessionId: true,
          isCurrent: true,
          classLevel: { select: { id: true, name: true, numeric: true } },
          section: { select: { id: true, name: true } },
          rollNumber: true,
        },
      },
    },
  },
}

type AdmitCardPrintRow = Awaited<ReturnType<typeof getAdmitCardPrint>>

function toAdmitCardPrintView(
  card: {
    id: string
    number: string
    status: string
    verifyToken: string
    examId: string
    exam: {
      sessionId: string
      name: string
      session: { name: string }
      subjects: {
        id: string
        examDate: Date | null
        startTime: string | null
        endTime: string | null
        roomName: string | null
        classSubject: {
          classLevelId: string
          subject: { name: string; code: string }
          sections: { sectionId: string }[]
        }
      }[]
    }
    student: {
      id: string
      firstName: string
      lastName: string
      admissionNo: string
      photoUrl: string | null
      enrollments: {
        sessionId: string
        isCurrent: boolean
        classLevel: { id: string; name: string; numeric?: number | null }
        section: { id: string; name: string } | null
        rollNumber: number | null
      }[]
    }
  },
  school: { name: string; addressLine1: string | null; city: string | null; state: string | null } | null,
  tenantFallback: { name: string; schoolName?: string | null },
  canApprove: boolean,
): AdmitCardPrintRow {
  const enrollment =
    card.student.enrollments.find((row) => row.sessionId === card.exam.sessionId) ??
    card.student.enrollments.find((row) => row.isCurrent) ??
    card.student.enrollments[0]
  const classLevelId = enrollment?.classLevel.id
  const sectionId = enrollment?.section?.id

  const dateSheet = card.exam.subjects.filter((p) => {
    if (classLevelId && p.classSubject.classLevelId !== classLevelId) return false
    return classSubjectAppliesToSection(
      p.classSubject.sections.map((row) => row.sectionId),
      sectionId,
    )
  })

  return {
    card: card as AdmitCardPrintRow['card'],
    schoolName: school?.name ?? tenantFallback.schoolName ?? tenantFallback.name,
    schoolAddress: [school?.addressLine1, school?.city, school?.state].filter(Boolean).join(', '),
    className: enrollment
      ? `${enrollment.classLevel.name}${enrollment.section ? ` · ${enrollment.section.name}` : ''}`
      : '—',
    rollNumber: enrollment?.rollNumber != null ? String(enrollment.rollNumber) : '—',
    dateSheet: dateSheet as AdmitCardPrintRow['dateSheet'],
    canPrint: card.status === 'APPROVED' || canApprove,
  }
}

/**
 * Approved admit cards ready to print, optionally limited to selected sections.
 * Ordered by class, section, then roll / name for handout batches.
 */
export async function listApprovedAdmitCardsForPrint(
  ctx: AppContext,
  examId: string,
  sectionIds?: string[],
): Promise<{ examName: string; cards: AdmitCardPrintRow[] }> {
  ctx.require('exams.view')

  const exam = await ctx.db.exam.findFirst({
    where: { id: examId, tenantId: ctx.tenant.id },
    select: {
      id: true,
      name: true,
      sessionId: true,
      classes: { select: { classLevelId: true } },
    },
  })
  if (!exam) throw notFound('Exam')

  const selected = sectionIds?.length ? [...new Set(sectionIds)] : []
  if (selected.length > 0) {
    const classIds = exam.classes.map((row) => row.classLevelId)
    const valid = await ctx.db.section.findMany({
      where: {
        id: { in: selected },
        classLevelId: { in: classIds },
        deletedAt: null,
      },
      select: { id: true },
    })
    if (valid.length !== selected.length) {
      throw conflict('One or more selected sections do not belong to this exam’s classes')
    }
  }

  const scope = await studentIdScopeWhere(ctx)
  const rows = await ctx.db.admitCard.findMany({
    where: {
      examId,
      tenantId: ctx.tenant.id,
      status: 'APPROVED',
      ...scope,
      ...(selected.length > 0
        ? {
            student: {
              enrollments: {
                some: {
                  sessionId: exam.sessionId,
                  sectionId: { in: selected },
                },
              },
            },
          }
        : {}),
    },
    include: admitCardPrintInclude,
  })

  const school = await ctx.db.school.findFirst({
    where: { tenantId: ctx.tenant.id },
    select: { name: true, addressLine1: true, city: true, state: true },
  })
  const canApprove = ctx.can('exams.admit_approve')
  const tenantFallback = {
    name: ctx.tenant.name,
    schoolName: ctx.tenant.school?.name ?? null,
  }

  const cards = rows
    .map((row) =>
      toAdmitCardPrintView(
        {
          ...row,
          exam: { ...row.exam, sessionId: exam.sessionId },
        },
        school,
        tenantFallback,
        canApprove,
      ),
    )
    .sort((a, b) => {
      const classCmp = a.className.localeCompare(b.className)
      if (classCmp !== 0) return classCmp
      const rollA = Number(a.rollNumber)
      const rollB = Number(b.rollNumber)
      if (Number.isFinite(rollA) && Number.isFinite(rollB) && rollA !== rollB) return rollA - rollB
      return `${a.card.student.firstName} ${a.card.student.lastName}`.localeCompare(
        `${b.card.student.firstName} ${b.card.student.lastName}`,
      )
    })

  return { examName: exam.name, cards }
}

export async function getAdmitCardSummary(ctx: AppContext, examId: string) {
  ctx.require('exams.view')
  await getExamDetail(ctx, examId)
  const scope = await studentIdScopeWhere(ctx)

  const [pending, approved, rejected, total] = await Promise.all([
    ctx.db.admitCard.count({ where: { examId, status: 'PENDING', ...scope } }),
    ctx.db.admitCard.count({ where: { examId, status: 'APPROVED', ...scope } }),
    ctx.db.admitCard.count({ where: { examId, status: 'REJECTED', ...scope } }),
    ctx.db.admitCard.count({ where: { examId, ...scope } }),
  ])

  return { pending, approved, rejected, total }
}
