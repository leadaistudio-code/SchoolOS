import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { ForbiddenError } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { currentSession } from '@/server/modules/academics/service'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
const clockTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Use HH:MM (24-hour)')
  .optional()

const VIEW_PERMS = ['exams.view', 'calendar.view', 'academics.view'] as const

function canManage(ctx: AppContext) {
  return ctx.can('exams.manage')
}

function requireView(ctx: AppContext) {
  if (!canManage(ctx) && !ctx.canAny(...VIEW_PERMS)) {
    throw new ForbiddenError('You do not have permission to view revision schedules')
  }
}

function requireManage(ctx: AppContext) {
  ctx.require('exams.manage')
}

async function loadPlan(ctx: AppContext, id: string) {
  const plan = await ctx.db.revisionPlan.findFirst({ where: { id } })
  if (!plan) throw notFound('Revision plan')
  return plan
}

function assertCanSeePlan(ctx: AppContext, plan: { publishedAt: Date | null }) {
  requireView(ctx)
  if (!plan.publishedAt && !canManage(ctx)) {
    throw new ForbiddenError('This revision plan is not published yet')
  }
}

function assertDraft(plan: { publishedAt: Date | null }) {
  if (plan.publishedAt) throw conflict('Unpublish the plan before editing or deleting it')
}

export const revisionPlanSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the plan a name').max(160),
    classLevelId: z.string().min(1).optional(),
    startsOn: isoDate,
    endsOn: isoDate,
    notes: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.endsOn >= v.startsOn, {
    path: ['endsOn'],
    message: 'End date cannot be before the start date',
  })

export const revisionSlotSchema = z.object({
  date: isoDate,
  startTime: clockTime,
  endTime: clockTime,
  periodLabel: z.string().trim().max(80).optional(),
  classLevelId: z.string().min(1, 'Select a class'),
  sectionId: z.string().min(1).optional(),
  subjectId: z.string().min(1, 'Select a subject'),
  topic: z.string().trim().min(1, 'Enter the topic').max(500),
  teacherStaffId: z.string().min(1).optional(),
  room: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export async function listPlans(ctx: AppContext) {
  requireView(ctx)
  const session = await currentSession(ctx)

  const plans = await ctx.db.revisionPlan.findMany({
    where: {
      sessionId: session.id,
      ...(canManage(ctx) ? {} : { publishedAt: { not: null } }),
    },
    orderBy: [{ startsOn: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      startsOn: true,
      endsOn: true,
      publishedAt: true,
      notes: true,
      classLevel: { select: { name: true } },
      _count: { select: { slots: true } },
    },
  })

  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    className: p.classLevel?.name ?? 'All classes',
    startsOn: p.startsOn,
    endsOn: p.endsOn,
    publishedAt: p.publishedAt,
    slotCount: p._count.slots,
    notes: p.notes,
  }))
}

export async function getPlan(ctx: AppContext, id: string) {
  const plan = await ctx.db.revisionPlan.findFirst({
    where: { id },
    include: {
      classLevel: { select: { id: true, name: true } },
      session: { select: { id: true, name: true } },
      slots: {
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { createdAt: 'asc' }],
        include: {
          classLevel: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  })
  if (!plan) throw notFound('Revision plan')
  assertCanSeePlan(ctx, plan)
  return plan
}

export async function createPlan(ctx: AppContext, input: z.infer<typeof revisionPlanSchema>) {
  requireManage(ctx)
  const session = await currentSession(ctx)

  if (input.classLevelId) {
    const cls = await ctx.db.classLevel.findFirst({
      where: { id: input.classLevelId, sessionId: session.id, deletedAt: null },
      select: { id: true },
    })
    if (!cls) throw notFound('Class')
  }

  const created = await ctx.db.revisionPlan.create({
    data: {
      tenantId: ctx.tenant.id,
      sessionId: session.id,
      name: input.name,
      classLevelId: input.classLevelId ?? null,
      startsOn: attendanceDate(input.startsOn),
      endsOn: attendanceDate(input.endsOn),
      notes: input.notes || null,
      createdById: ctx.user.userId,
      createdByLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'revision_plan.create',
    module: 'exams',
    entityType: 'RevisionPlan',
    entityId: created.id,
    summary: `Created revision plan "${created.name}"`,
    after: created,
  })

  return created
}

export async function updatePlan(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof revisionPlanSchema>,
) {
  requireManage(ctx)
  const before = await loadPlan(ctx, id)
  assertDraft(before)

  if (input.classLevelId) {
    const cls = await ctx.db.classLevel.findFirst({
      where: { id: input.classLevelId, sessionId: before.sessionId, deletedAt: null },
      select: { id: true },
    })
    if (!cls) throw notFound('Class')
  }

  const updated = await ctx.db.revisionPlan.update({
    where: { id },
    data: {
      name: input.name,
      classLevelId: input.classLevelId ?? null,
      startsOn: attendanceDate(input.startsOn),
      endsOn: attendanceDate(input.endsOn),
      notes: input.notes || null,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'revision_plan.update',
    module: 'exams',
    entityType: 'RevisionPlan',
    entityId: id,
    summary: `Updated revision plan "${updated.name}"`,
    before,
    after: updated,
  })

  return updated
}

export async function deletePlan(ctx: AppContext, id: string) {
  requireManage(ctx)
  const before = await loadPlan(ctx, id)
  assertDraft(before)

  await ctx.db.revisionPlan.delete({ where: { id } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'revision_plan.delete',
    module: 'exams',
    entityType: 'RevisionPlan',
    entityId: id,
    summary: `Deleted revision plan "${before.name}"`,
    before,
  })

  return { ok: true as const }
}

export async function publishPlan(ctx: AppContext, id: string) {
  requireManage(ctx)
  const before = await loadPlan(ctx, id)
  if (before.publishedAt) throw conflict('This plan is already published')

  const slotCount = await ctx.db.revisionSlot.count({ where: { planId: id } })
  if (slotCount === 0) throw conflict('Add at least one revision slot before publishing')

  const updated = await ctx.db.revisionPlan.update({
    where: { id },
    data: { publishedAt: new Date() },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'revision_plan.publish',
    module: 'exams',
    entityType: 'RevisionPlan',
    entityId: id,
    summary: `Published revision plan "${before.name}"`,
    before,
    after: updated,
  })

  return updated
}

export async function unpublishPlan(ctx: AppContext, id: string) {
  requireManage(ctx)
  const before = await loadPlan(ctx, id)
  if (!before.publishedAt) throw conflict('This plan is not published')

  const updated = await ctx.db.revisionPlan.update({
    where: { id },
    data: { publishedAt: null },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'revision_plan.unpublish',
    module: 'exams',
    entityType: 'RevisionPlan',
    entityId: id,
    summary: `Unpublished revision plan "${before.name}"`,
    before,
    after: updated,
  })

  return updated
}

async function assertSlotRefs(
  ctx: AppContext,
  plan: { id: string; startsOn: Date; endsOn: Date; classLevelId: string | null },
  input: z.infer<typeof revisionSlotSchema>,
) {
  const day = attendanceDate(input.date)
  if (day < attendanceDate(plan.startsOn) || day > attendanceDate(plan.endsOn)) {
    throw new ApiException(400, 'BAD_REQUEST', 'Slot date must fall within the plan date range')
  }

  const cls = await ctx.db.classLevel.findFirst({
    where: { id: input.classLevelId, deletedAt: null },
    select: { id: true, sessionId: true },
  })
  if (!cls) throw notFound('Class')

  if (plan.classLevelId && plan.classLevelId !== input.classLevelId) {
    throw conflict('This plan is scoped to another class — pick that class for each slot or edit the plan')
  }

  if (input.sectionId) {
    const section = await ctx.db.section.findFirst({
      where: { id: input.sectionId, classLevelId: input.classLevelId, deletedAt: null },
      select: { id: true },
    })
    if (!section) throw notFound('Section')
  }

  const subjectLink = await ctx.db.classSubject.findFirst({
    where: {
      classLevelId: input.classLevelId,
      subjectId: input.subjectId,
    },
    select: { id: true },
  })
  if (!subjectLink) throw conflict('That subject is not assigned to the selected class')

  if (input.teacherStaffId) {
    const teacher = await ctx.db.staff.findFirst({
      where: { id: input.teacherStaffId, deletedAt: null },
      select: { id: true },
    })
    if (!teacher) throw notFound('Teacher')
  }
}

function slotData(ctx: AppContext, planId: string, input: z.infer<typeof revisionSlotSchema>) {
  return {
    tenantId: ctx.tenant.id,
    planId,
    date: attendanceDate(input.date),
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    periodLabel: input.periodLabel || null,
    classLevelId: input.classLevelId,
    sectionId: input.sectionId ?? null,
    subjectId: input.subjectId,
    topic: input.topic,
    teacherStaffId: input.teacherStaffId ?? null,
    room: input.room || null,
    notes: input.notes || null,
  }
}

export async function addSlot(ctx: AppContext, planId: string, input: z.infer<typeof revisionSlotSchema>) {
  requireManage(ctx)
  const plan = await loadPlan(ctx, planId)
  assertDraft(plan)
  await assertSlotRefs(ctx, plan, input)

  const created = await ctx.db.revisionSlot.create({
    data: slotData(ctx, planId, input),
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'revision_slot.create',
    module: 'exams',
    entityType: 'RevisionSlot',
    entityId: created.id,
    summary: `Added revision slot for ${input.topic} on ${input.date}`,
    after: created,
  })

  return created
}

export async function updateSlot(
  ctx: AppContext,
  slotId: string,
  input: z.infer<typeof revisionSlotSchema>,
) {
  requireManage(ctx)
  const before = await ctx.db.revisionSlot.findFirst({ where: { id: slotId } })
  if (!before) throw notFound('Revision slot')

  const plan = await loadPlan(ctx, before.planId)
  assertDraft(plan)
  await assertSlotRefs(ctx, plan, input)

  const updated = await ctx.db.revisionSlot.update({
    where: { id: slotId },
    data: slotData(ctx, before.planId, input),
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'revision_slot.update',
    module: 'exams',
    entityType: 'RevisionSlot',
    entityId: slotId,
    summary: `Updated revision slot for ${input.topic} on ${input.date}`,
    before,
    after: updated,
  })

  return updated
}

export async function deleteSlot(ctx: AppContext, slotId: string) {
  requireManage(ctx)
  const before = await ctx.db.revisionSlot.findFirst({ where: { id: slotId } })
  if (!before) throw notFound('Revision slot')

  const plan = await loadPlan(ctx, before.planId)
  assertDraft(plan)

  await ctx.db.revisionSlot.delete({ where: { id: slotId } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'revision_slot.delete',
    module: 'exams',
    entityType: 'RevisionSlot',
    entityId: slotId,
    summary: `Removed revision slot for ${before.topic} on ${toDateInput(before.date)}`,
    before,
  })

  return { ok: true as const }
}

/** Class levels, sections, and class-subjects for building slot forms. */
export async function revisionEditorOptions(ctx: AppContext) {
  requireManage(ctx)
  const session = await currentSession(ctx)

  const [classes, classSubjects, staff] = await Promise.all([
    ctx.db.classLevel.findMany({
      where: { sessionId: session.id, deletedAt: null },
      orderBy: { numeric: 'asc' },
      select: {
        id: true,
        name: true,
        sections: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        },
      },
    }),
    ctx.db.classSubject.findMany({
      where: { classLevel: { sessionId: session.id, deletedAt: null } },
      select: {
        classLevelId: true,
        subject: { select: { id: true, name: true } },
      },
      orderBy: [{ classLevel: { numeric: 'asc' } }, { subject: { name: 'asc' } }],
    }),
    ctx.db.staff.findMany({
      where: { deletedAt: null },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
      take: 500,
    }),
  ])

  const subjectsByClass = new Map<string, { id: string; name: string }[]>()
  for (const row of classSubjects) {
    const list = subjectsByClass.get(row.classLevelId) ?? []
    if (!list.some((s) => s.id === row.subject.id)) list.push(row.subject)
    subjectsByClass.set(row.classLevelId, list)
  }

  return {
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      sections: c.sections,
      subjects: subjectsByClass.get(c.id) ?? [],
    })),
    staff: staff.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
    })),
  }
}

/** Class levels for the plan create/edit form (current session). */
export async function revisionPlanClassOptions(ctx: AppContext) {
  requireManage(ctx)
  const session = await currentSession(ctx)
  return ctx.db.classLevel.findMany({
    where: { sessionId: session.id, deletedAt: null },
    orderBy: { numeric: 'asc' },
    select: { id: true, name: true },
  })
}