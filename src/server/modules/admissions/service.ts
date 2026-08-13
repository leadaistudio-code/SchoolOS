import type { LeadStage, Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, conflict, forbidden, notFound } from '@/server/api/response'
import { createStudent } from '@/server/modules/students/service'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { prisma } from '@/server/db/prisma'
import { rateLimit } from '@/server/rate-limit'
import {
  FOLLOW_UP_CHANNELS,
  LEAD_STAGES,
  OPEN_STAGES,
  STAGE_LABELS,
} from '@/lib/admissions'
import {
  followUpCompleteSchema,
  followUpCreateSchema,
  leadConvertSchema,
  leadCreateSchema,
  leadStageSchema,
  leadUpdateSchema,
  publicEnquireSchema,
  type FollowUpCompleteInput,
  type FollowUpCreateInput,
  type LeadConvertInput,
  type LeadCreateInput,
  type LeadStageInput,
  type LeadUpdateInput,
  type PublicEnquireInput,
} from './schema'

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Student', lastName: 'Unknown' }
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '—' }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') }
}

async function writeActivity(
  // Tenant-scoped clients and transaction clients do not share a callable union for create().
  db: {
    leadActivity: {
      create: (args: {
        data: {
          tenantId: string
          leadId: string
          type: string
          summary: string
          actorId?: string | null
          meta?: Prisma.InputJsonValue
        }
      }) => Promise<unknown>
    }
  },
  params: {
    tenantId: string
    leadId: string
    type: string
    summary: string
    actorId?: string | null
    meta?: Prisma.InputJsonValue
  },
) {
  await db.leadActivity.create({
    data: {
      tenantId: params.tenantId,
      leadId: params.leadId,
      type: params.type,
      summary: params.summary,
      actorId: params.actorId ?? null,
      meta: params.meta,
    },
  })
}

export async function listLeadsByStage(ctx: AppContext) {
  ctx.require('admissions.view')
  const leads = await ctx.db.admissionLead.findMany({
    where: { deletedAt: null },
    orderBy: [{ stageOrder: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      reference: true,
      studentName: true,
      parentName: true,
      phone: true,
      email: true,
      source: true,
      stage: true,
      stageOrder: true,
      interestedClassId: true,
      assignedToId: true,
      nextFollowUpOn: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const classIds = [...new Set(leads.map((l) => l.interestedClassId).filter(Boolean))] as string[]
  const classes =
    classIds.length > 0
      ? await ctx.db.classLevel.findMany({
          where: { id: { in: classIds } },
          select: { id: true, name: true },
        })
      : []
  const className = new Map(classes.map((c) => [c.id, c.name]))

  const board: Record<string, Array<(typeof leads)[number] & { className: string | null }>> = {}
  for (const stage of LEAD_STAGES) board[stage] = []
  for (const lead of leads) {
    const row = {
      ...lead,
      className: lead.interestedClassId ? (className.get(lead.interestedClassId) ?? null) : null,
    }
    board[lead.stage]?.push(row)
  }
  return board
}

export async function listLeadSetup(ctx: AppContext) {
  ctx.require('admissions.view')
  const [classes, staff] = await Promise.all([
    ctx.db.classLevel.findMany({
      where: { deletedAt: null },
      orderBy: { numeric: 'asc' },
      select: { id: true, name: true },
    }),
    ctx.db.staff.findMany({
      where: { deletedAt: null, userId: { not: null } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, userId: true },
      take: 200,
    }),
  ])
  return { classes, staff }
}

export async function getLead(ctx: AppContext, id: string) {
  ctx.require('admissions.view')
  const lead = await ctx.db.admissionLead.findFirst({
    where: { id, deletedAt: null },
    include: {
      followUps: { orderBy: [{ dueOn: 'asc' }, { createdAt: 'desc' }] },
      activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      documents: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, title: true, category: true, createdAt: true },
      },
    },
  })
  if (!lead) throw notFound('Lead not found')

  const [classLevel, assignee, converted] = await Promise.all([
    lead.interestedClassId
      ? ctx.db.classLevel.findFirst({
          where: { id: lead.interestedClassId },
          select: { id: true, name: true },
        })
      : null,
    lead.assignedToId
      ? ctx.db.user.findFirst({
          where: { id: lead.assignedToId },
          select: { id: true, firstName: true, lastName: true },
        })
      : null,
    lead.convertedStudentId
      ? ctx.db.student.findFirst({
          where: { id: lead.convertedStudentId },
          select: { id: true, admissionNo: true, firstName: true, lastName: true },
        })
      : null,
  ])

  return { ...lead, classLevel, assignee, converted }
}

export async function createLead(ctx: AppContext, raw: LeadCreateInput) {
  ctx.require('admissions.manage')
  const input = leadCreateSchema.parse(raw)

  const lead = await ctx.db.$transaction(async (tx) => {
    const reference = await nextDocumentNumber(tx, {
      tenantId: ctx.tenant.id,
      kind: 'LEAD',
      sessionLabel: financialYearLabel(new Date()),
    })

    const created = await tx.admissionLead.create({
      data: {
        tenantId: ctx.tenant.id,
        reference,
        studentName: input.studentName,
        parentName: input.parentName,
        phone: input.phone,
        email: input.email ?? null,
        source: input.source,
        interestedClassId: input.interestedClassId ?? null,
        assignedToId: input.assignedToId ?? null,
        nextFollowUpOn: input.nextFollowUpOn ?? null,
        notes: input.notes ?? null,
        stage: 'NEW',
        stageOrder: 0,
      },
    })

    await writeActivity(tx as never, {
      tenantId: ctx.tenant.id,
      leadId: created.id,
      type: 'NOTE',
      summary: `Enquiry captured (${input.source.replaceAll('_', ' ').toLowerCase()}).`,
      actorId: ctx.user.userId,
    })

    return created
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'admissions.lead.create',
    module: 'admissions',
    entityType: 'AdmissionLead',
    entityId: lead.id,
    summary: `Created lead ${lead.reference} for ${lead.studentName}`,
  })

  return lead
}

export async function updateLead(ctx: AppContext, id: string, raw: LeadUpdateInput) {
  ctx.require('admissions.manage')
  const input = leadUpdateSchema.parse(raw)
  const existing = await ctx.db.admissionLead.findFirst({ where: { id, deletedAt: null } })
  if (!existing) throw notFound('Lead not found')
  if (existing.stage === 'ENROLLED') throw conflict('An enrolled lead cannot be edited')

  const lead = await ctx.db.admissionLead.update({
    where: { id },
    data: {
      studentName: input.studentName,
      parentName: input.parentName,
      phone: input.phone,
      email: input.email === undefined ? undefined : (input.email ?? null),
      source: input.source,
      interestedClassId:
        input.interestedClassId === undefined ? undefined : (input.interestedClassId ?? null),
      assignedToId: input.assignedToId === undefined ? undefined : (input.assignedToId ?? null),
      nextFollowUpOn: input.nextFollowUpOn === undefined ? undefined : input.nextFollowUpOn,
      notes: input.notes === undefined ? undefined : (input.notes ?? null),
    },
  })

  await writeActivity(ctx.db, {
    tenantId: ctx.tenant.id,
    leadId: lead.id,
    type: 'NOTE',
    summary: 'Lead details updated.',
    actorId: ctx.user.userId,
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'admissions.lead.update',
    module: 'admissions',
    entityType: 'AdmissionLead',
    entityId: lead.id,
    summary: `Updated lead ${lead.reference}`,
  })

  return lead
}

export async function moveLeadStage(ctx: AppContext, id: string, raw: LeadStageInput) {
  ctx.require('admissions.manage')
  const input = leadStageSchema.parse(raw)
  const existing = await ctx.db.admissionLead.findFirst({ where: { id, deletedAt: null } })
  if (!existing) throw notFound('Lead not found')
  if (existing.stage === 'ENROLLED' && input.stage !== 'ENROLLED') {
    throw conflict('An enrolled lead cannot move backwards — reverse enrolment from the student record')
  }
  if (input.stage === 'LOST' && !input.lostReason?.trim()) {
    throw badRequest('A lost reason is required')
  }
  if (input.stage === 'ENROLLED') {
    throw badRequest('Use convert to enrol a lead as a student')
  }

  const stageOrder = LEAD_STAGES.indexOf(input.stage)
  const lead = await ctx.db.admissionLead.update({
    where: { id },
    data: {
      stage: input.stage as LeadStage,
      stageOrder: stageOrder < 0 ? 0 : stageOrder,
      lostReason: input.stage === 'LOST' ? input.lostReason! : null,
    },
  })

  await writeActivity(ctx.db, {
    tenantId: ctx.tenant.id,
    leadId: lead.id,
    type: 'STAGE_CHANGE',
    summary: `Moved from ${STAGE_LABELS[existing.stage as keyof typeof STAGE_LABELS] ?? existing.stage} to ${STAGE_LABELS[input.stage]}.`,
    actorId: ctx.user.userId,
    meta: { from: existing.stage, to: input.stage, note: input.note ?? null },
  })

  if (input.note) {
    await writeActivity(ctx.db, {
      tenantId: ctx.tenant.id,
      leadId: lead.id,
      type: 'NOTE',
      summary: input.note,
      actorId: ctx.user.userId,
    })
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'admissions.lead.stage',
    module: 'admissions',
    entityType: 'AdmissionLead',
    entityId: lead.id,
    summary: `${lead.reference}: ${existing.stage} → ${input.stage}`,
  })

  return lead
}

export async function createFollowUp(ctx: AppContext, leadId: string, raw: FollowUpCreateInput) {
  ctx.require('admissions.manage')
  const input = followUpCreateSchema.parse(raw)
  const lead = await ctx.db.admissionLead.findFirst({ where: { id: leadId, deletedAt: null } })
  if (!lead) throw notFound('Lead not found')

  const followUp = await ctx.db.leadFollowUp.create({
    data: {
      tenantId: ctx.tenant.id,
      leadId,
      dueOn: input.dueOn,
      channel: input.channel,
      note: input.note ?? null,
      assignedToId: input.assignedToId ?? lead.assignedToId,
    },
  })

  await ctx.db.admissionLead.update({
    where: { id: leadId },
    data: { nextFollowUpOn: input.dueOn },
  })

  await writeActivity(ctx.db, {
    tenantId: ctx.tenant.id,
    leadId,
    type: 'NOTE',
    summary: `Follow-up scheduled for ${input.dueOn.toISOString().slice(0, 10)} via ${input.channel.toLowerCase()}.`,
    actorId: ctx.user.userId,
  })

  return followUp
}

export async function completeFollowUp(
  ctx: AppContext,
  followUpId: string,
  raw: FollowUpCompleteInput,
) {
  ctx.require('admissions.manage')
  const input = followUpCompleteSchema.parse(raw)
  const followUp = await ctx.db.leadFollowUp.findFirst({ where: { id: followUpId } })
  if (!followUp) throw notFound('Follow-up not found')
  if (followUp.doneAt) throw conflict('This follow-up is already completed')

  const updated = await ctx.db.leadFollowUp.update({
    where: { id: followUpId },
    data: { doneAt: new Date(), outcome: input.outcome },
  })

  await writeActivity(ctx.db, {
    tenantId: ctx.tenant.id,
    leadId: followUp.leadId,
    type: followUp.channel === 'CALL' ? 'CALL' : followUp.channel === 'EMAIL' ? 'EMAIL' : 'NOTE',
    summary: input.outcome,
    actorId: ctx.user.userId,
  })

  return updated
}

export async function listFollowUps(ctx: AppContext) {
  ctx.require('admissions.manage')
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const rows = await ctx.db.leadFollowUp.findMany({
    where: { doneAt: null },
    orderBy: [{ dueOn: 'asc' }, { createdAt: 'asc' }],
    include: {
      lead: {
        select: {
          id: true,
          reference: true,
          studentName: true,
          parentName: true,
          phone: true,
          stage: true,
          deletedAt: true,
        },
      },
    },
    take: 200,
  })

  return rows
    .filter((row) => !row.lead.deletedAt)
    .map((row) => ({
      ...row,
      overdue: row.dueOn < today,
    }))
}

export async function convertLead(ctx: AppContext, id: string, raw: LeadConvertInput) {
  ctx.require('admissions.convert')
  if (!ctx.can('students.create')) throw forbidden('Student create permission is required to convert')

  const input = leadConvertSchema.parse(raw)
  const lead = await ctx.db.admissionLead.findFirst({ where: { id, deletedAt: null } })
  if (!lead) throw notFound('Lead not found')
  if (lead.convertedStudentId || lead.stage === 'ENROLLED') {
    throw conflict('This lead is already enrolled')
  }

  const names = splitName(lead.studentName)
  const parent = splitName(lead.parentName)

  const student = await createStudent(ctx, {
    admissionNo: input.admissionNo,
    firstName: input.firstName?.trim() || names.firstName,
    lastName: input.lastName?.trim() || names.lastName,
    classLevelId: input.classLevelId,
    sectionId: input.sectionId,
    admissionDate: new Date(),
    guardian: {
      firstName: parent.firstName,
      lastName: parent.lastName,
      relation: input.guardianRelation,
      phone: lead.phone,
      email: lead.email ?? undefined,
      createLogin: false,
    },
  })

  const updated = await ctx.db.admissionLead.update({
    where: { id },
    data: {
      stage: 'ENROLLED',
      stageOrder: LEAD_STAGES.indexOf('ENROLLED'),
      convertedStudentId: student.id,
      lostReason: null,
    },
  })

  await writeActivity(ctx.db, {
    tenantId: ctx.tenant.id,
    leadId: id,
    type: 'STAGE_CHANGE',
    summary: `Converted to student ${student.admissionNo}.`,
    actorId: ctx.user.userId,
    meta: { studentId: student.id, admissionNo: student.admissionNo },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'admissions.lead.convert',
    module: 'admissions',
    entityType: 'AdmissionLead',
    entityId: id,
    summary: `Converted ${lead.reference} → ${student.admissionNo}`,
  })

  return { lead: updated, student }
}

export async function getAdmissionsAnalytics(ctx: AppContext) {
  ctx.require('admissions.view')
  const leads = await ctx.db.admissionLead.findMany({
    where: { deletedAt: null },
    select: { stage: true, source: true, createdAt: true },
  })

  const byStage: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  for (const stage of LEAD_STAGES) byStage[stage] = 0
  for (const lead of leads) {
    byStage[lead.stage] = (byStage[lead.stage] ?? 0) + 1
    const source = lead.source ?? 'OTHER'
    bySource[source] = (bySource[source] ?? 0) + 1
  }

  const enrolled = byStage.ENROLLED ?? 0
  const lost = byStage.LOST ?? 0
  const open = OPEN_STAGES.reduce((sum, stage) => sum + (byStage[stage] ?? 0), 0)
  const closed = enrolled + lost
  const conversionRate = closed > 0 ? Math.round((enrolled / closed) * 1000) / 10 : null

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const overdueFollowUps = await ctx.db.leadFollowUp.count({
    where: { doneAt: null, dueOn: { lt: today } },
  })

  return {
    total: leads.length,
    open,
    enrolled,
    lost,
    conversionRate,
    overdueFollowUps,
    byStage,
    bySource,
  }
}

/** Unauthenticated public enquiry — tenant resolved by host. */
export async function submitPublicEnquiry(
  tenantId: string,
  raw: PublicEnquireInput,
  meta: { ip?: string | null },
) {
  const input = publicEnquireSchema.parse(raw)
  if (input.company) throw badRequest('Rejected')

  const limited = await rateLimit(`enquire:${tenantId}:${meta.ip ?? 'unknown'}`, 8, 3600)
  if (!limited.ok) {
    throw badRequest(`Too many enquiries. Try again in ${limited.retryAfterSeconds}s.`)
  }

  const db = prisma
  let interestedClassId: string | null = null
  if (input.interestedClass) {
    const match = await db.classLevel.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        name: { equals: input.interestedClass, mode: 'insensitive' },
      },
      select: { id: true },
    })
    interestedClassId = match?.id ?? null
  }

  const lead = await db.$transaction(async (tx) => {
    const reference = await nextDocumentNumber(tx, {
      tenantId,
      kind: 'LEAD',
      sessionLabel: financialYearLabel(new Date()),
    })

    const created = await tx.admissionLead.create({
      data: {
        tenantId,
        reference,
        studentName: input.studentName,
        parentName: input.parentName,
        phone: input.phone,
        email: input.email ?? null,
        source: 'WEBSITE',
        interestedClassId,
        notes: input.notes ?? null,
        stage: 'NEW',
        stageOrder: 0,
      },
    })

    await tx.leadActivity.create({
      data: {
        tenantId,
        leadId: created.id,
        type: 'NOTE',
        summary: 'Enquiry submitted via the public form.',
      },
    })

    return created
  })

  await audit({
    tenantId,
    actorId: null,
    actorLabel: 'Public enquiry',
    action: 'admissions.enquire.public',
    module: 'admissions',
    entityType: 'AdmissionLead',
    entityId: lead.id,
    summary: `Public enquiry ${lead.reference} for ${lead.studentName}`,
  })

  return { reference: lead.reference }
}

export { LEAD_STAGES, STAGE_LABELS, FOLLOW_UP_CHANNELS, OPEN_STAGES } from '@/lib/admissions'
