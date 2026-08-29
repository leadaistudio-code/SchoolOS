import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'

export const DAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
] as const

export const slotSchema = z.object({
  sectionId: z.string().min(1),
  periodId: z.string().min(1),
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  /** Empty clears the slot — a free period is a legitimate state. */
  classSubjectId: z.string().optional(),
  roomName: z.string().trim().max(40).optional(),
})

export type SlotInput = z.infer<typeof slotSchema>

export const periodSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use a 24-hour HH:mm time'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use a 24-hour HH:mm time'),
    isBreak: z.coerce.boolean().default(false),
    sortOrder: z.coerce.number().int().min(0).max(50).default(0),
  })
  .refine((v) => v.endTime > v.startTime, {
    path: ['endTime'],
    message: 'The period must end after it starts',
  })

export type TimetableCell = {
  slotId: string | null
  subject: string | null
  subjectCode: string | null
  teacher: string | null
  teacherId: string | null
  classSubjectId: string | null
  roomName: string | null
}

export type TimetableGrid = {
  periods: {
    id: string
    name: string
    startTime: string
    endTime: string
    isBreak: boolean
  }[]
  days: typeof DAYS
  /** cells[periodId][dayOfWeek] */
  cells: Record<string, Record<number, TimetableCell>>
}

/**
 * The weekly grid for one section, laid out as periods × days so the UI can
 * render it directly rather than searching a flat list per cell.
 */
export async function sectionTimetable(
  ctx: AppContext,
  sectionId: string,
): Promise<TimetableGrid & { section: { id: string; name: string; className: string } }> {
  ctx.require('timetable.view')

  const section = await ctx.db.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    select: { id: true, name: true, classLevel: { select: { name: true } } },
  })
  if (!section) throw notFound('Section')

  const [periods, slots] = await Promise.all([
    ctx.db.timetablePeriod.findMany({ orderBy: { sortOrder: 'asc' } }),
    ctx.db.timetableSlot.findMany({
      where: { sectionId },
      select: {
        id: true,
        periodId: true,
        dayOfWeek: true,
        roomName: true,
        classSubjectId: true,
        teacher: { select: { id: true, firstName: true, lastName: true } },
        classSubject: { select: { subject: { select: { name: true, code: true } } } },
      },
    }),
  ])

  const cells: Record<string, Record<number, TimetableCell>> = {}
  for (const period of periods) {
    cells[period.id] = {}
    for (const day of DAYS) {
      cells[period.id]![day.value] = emptyCell()
    }
  }

  for (const slot of slots) {
    const row = cells[slot.periodId]
    if (!row) continue
    row[slot.dayOfWeek] = {
      slotId: slot.id,
      subject: slot.classSubject?.subject.name ?? null,
      subjectCode: slot.classSubject?.subject.code ?? null,
      teacher: slot.teacher ? `${slot.teacher.firstName} ${slot.teacher.lastName}` : null,
      teacherId: slot.teacher?.id ?? null,
      classSubjectId: slot.classSubjectId,
      roomName: slot.roomName,
    }
  }

  return {
    section: { id: section.id, name: section.name, className: section.classLevel.name },
    periods: periods.map((p) => ({
      id: p.id,
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      isBreak: p.isBreak,
    })),
    days: DAYS,
    cells,
  }
}

function emptyCell(): TimetableCell {
  return {
    slotId: null,
    subject: null,
    subjectCode: null,
    teacher: null,
    teacherId: null,
    classSubjectId: null,
    roomName: null,
  }
}

/** The same grid from a teacher's point of view: which class they are with. */
export async function teacherTimetable(ctx: AppContext, staffId: string) {
  ctx.require('timetable.view')

  const [staff, periods, slots] = await Promise.all([
    ctx.db.staff.findFirst({
      where: { id: staffId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
    ctx.db.timetablePeriod.findMany({ orderBy: { sortOrder: 'asc' } }),
    ctx.db.timetableSlot.findMany({
      where: { teacherId: staffId },
      select: {
        id: true,
        periodId: true,
        dayOfWeek: true,
        roomName: true,
        section: { select: { name: true, classLevel: { select: { name: true } } } },
        classSubject: { select: { subject: { select: { name: true, code: true } } } },
      },
    }),
  ])
  if (!staff) throw notFound('Staff member')

  const cells: Record<string, Record<number, TimetableCell>> = {}
  for (const period of periods) {
    cells[period.id] = {}
    for (const day of DAYS) cells[period.id]![day.value] = emptyCell()
  }

  for (const slot of slots) {
    const row = cells[slot.periodId]
    if (!row) continue
    row[slot.dayOfWeek] = {
      slotId: slot.id,
      subject: slot.classSubject?.subject.name ?? null,
      subjectCode: slot.classSubject?.subject.code ?? null,
      // In the teacher view, the "who" column is the class being taught.
      teacher: `${slot.section.classLevel.name} ${slot.section.name}`,
      teacherId: staff.id,
      classSubjectId: null,
      roomName: slot.roomName,
    }
  }

  const load = slots.length

  return {
    staff,
    periods: periods.map((p) => ({
      id: p.id,
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      isBreak: p.isBreak,
    })),
    days: DAYS,
    cells,
    periodsPerWeek: load,
  }
}

export type ConflictReport = {
  ok: boolean
  reason?: string
  clashWith?: string
}

/**
 * Checks a proposed slot before writing it.
 *
 * Two things must hold, and the database enforces both with unique
 * constraints. This function exists so the user gets a sentence explaining
 * WHICH class the teacher is already with, rather than a constraint violation.
 */
export async function checkConflicts(
  ctx: AppContext,
  input: SlotInput,
  teacherId: string | null,
): Promise<ConflictReport> {
  const sectionClash = await ctx.db.timetableSlot.findFirst({
    where: {
      sectionId: input.sectionId,
      dayOfWeek: input.dayOfWeek,
      periodId: input.periodId,
    },
    select: { id: true, classSubject: { select: { subject: { select: { name: true } } } } },
  })

  // Replacing the existing lesson in this cell is the normal case, not a clash.
  if (sectionClash && !teacherId) return { ok: true }

  if (teacherId) {
    const teacherClash = await ctx.db.timetableSlot.findFirst({
      where: {
        teacherId,
        dayOfWeek: input.dayOfWeek,
        periodId: input.periodId,
        sectionId: { not: input.sectionId },
      },
      select: {
        section: { select: { name: true, classLevel: { select: { name: true } } } },
        classSubject: { select: { subject: { select: { name: true } } } },
      },
    })

    if (teacherClash) {
      const where = `${teacherClash.section.classLevel.name} ${teacherClash.section.name}`
      return {
        ok: false,
        reason: `That teacher is already taking ${teacherClash.classSubject?.subject.name ?? 'a lesson'} with ${where} in this period.`,
        clashWith: where,
      }
    }
  }

  return { ok: true }
}

/**
 * Sets or clears one cell of the grid.
 *
 * The whole operation runs in a transaction: the existing slot is removed and
 * the new one written, so a failed conflict check can never leave the cell
 * empty when the user meant to change it.
 */
export async function setSlot(ctx: AppContext, input: SlotInput) {
  ctx.require('timetable.manage')

  const section = await ctx.db.section.findFirst({
    where: { id: input.sectionId, deletedAt: null },
    select: { id: true, classLevelId: true, name: true, classLevel: { select: { name: true } } },
  })
  if (!section) throw notFound('Section')

  const period = await ctx.db.timetablePeriod.findFirst({ where: { id: input.periodId } })
  if (!period) throw notFound('Period')
  if (period.isBreak) {
    throw new ApiException(400, 'BAD_REQUEST', 'A break period cannot hold a lesson')
  }

  let teacherId: string | null = null
  if (input.classSubjectId) {
    const classSubject = await ctx.db.classSubject.findFirst({
      where: { id: input.classSubjectId },
      select: { id: true, classLevelId: true, teacherId: true },
    })
    if (!classSubject) throw notFound('Subject')
    if (classSubject.classLevelId !== section.classLevelId) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        'That subject does not belong to this section class',
      )
    }
    teacherId = classSubject.teacherId

    const verdict = await checkConflicts(ctx, input, teacherId)
    if (!verdict.ok) throw conflict(verdict.reason!)
  }

  const result = await ctx.db.$transaction(async (tx) => {
    await tx.timetableSlot.deleteMany({
      where: {
        sectionId: input.sectionId,
        dayOfWeek: input.dayOfWeek,
        periodId: input.periodId,
      },
    })

    if (!input.classSubjectId) return null

    return tx.timetableSlot.create({
      data: {
        tenantId: ctx.tenant.id,
        classLevelId: section.classLevelId,
        sectionId: input.sectionId,
        periodId: input.periodId,
        dayOfWeek: input.dayOfWeek,
        classSubjectId: input.classSubjectId,
        teacherId,
        roomName: input.roomName ?? null,
      },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: result ? 'timetable.set_slot' : 'timetable.clear_slot',
    module: 'timetable',
    entityType: 'Section',
    entityId: input.sectionId,
    summary: `${result ? 'Set' : 'Cleared'} ${section.classLevel.name} ${section.name}, ${period.name}, day ${input.dayOfWeek}`,
  })

  return result
}

/** Periods that make up the school day. */
export async function listPeriods(ctx: AppContext) {
  return ctx.db.timetablePeriod.findMany({ orderBy: { sortOrder: 'asc' } })
}

export async function createPeriod(ctx: AppContext, input: z.infer<typeof periodSchema>) {
  ctx.require('timetable.manage')

  const existing = await ctx.db.timetablePeriod.findFirst({ where: { name: input.name } })
  if (existing) throw conflict(`A period called ${input.name} already exists`)

  // Overlapping periods would make "which lesson is now" ambiguous.
  const overlapping = await ctx.db.timetablePeriod.findFirst({
    where: { startTime: { lt: input.endTime }, endTime: { gt: input.startTime } },
    select: { name: true, startTime: true, endTime: true },
  })
  if (overlapping) {
    throw conflict(
      `That time overlaps ${overlapping.name} (${overlapping.startTime}–${overlapping.endTime})`,
    )
  }

  const created = await ctx.db.timetablePeriod.create({
    data: { tenantId: ctx.tenant.id, ...input },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'timetable.create_period',
    module: 'timetable',
    entityType: 'TimetablePeriod',
    entityId: created.id,
    summary: `Added period ${created.name} (${created.startTime}–${created.endTime})`,
    after: created,
  })
  return created
}

export const periodUpdateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(40),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use a 24-hour HH:mm time'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use a 24-hour HH:mm time'),
    isBreak: z.coerce.boolean().default(false),
    sortOrder: z.coerce.number().int().min(0).max(50).default(0),
  })
  .refine((v) => v.endTime > v.startTime, {
    path: ['endTime'],
    message: 'The period must end after it starts',
  })

/** Updates a period's name, times or break flag. Clears lessons if turned into a break. */
export async function updatePeriod(ctx: AppContext, input: z.infer<typeof periodUpdateSchema>) {
  ctx.require('timetable.manage')

  const existing = await ctx.db.timetablePeriod.findFirst({ where: { id: input.id } })
  if (!existing) throw notFound('Period')

  const nameClash = await ctx.db.timetablePeriod.findFirst({
    where: { name: input.name, id: { not: input.id } },
    select: { id: true },
  })
  if (nameClash) throw conflict(`A period called ${input.name} already exists`)

  const overlapping = await ctx.db.timetablePeriod.findFirst({
    where: {
      id: { not: input.id },
      startTime: { lt: input.endTime },
      endTime: { gt: input.startTime },
    },
    select: { name: true, startTime: true, endTime: true },
  })
  if (overlapping) {
    throw conflict(
      `That time overlaps ${overlapping.name} (${overlapping.startTime}–${overlapping.endTime})`,
    )
  }

  const updated = await ctx.db.$transaction(async (tx) => {
    // A break cannot hold lessons — clear any that were already scheduled.
    if (input.isBreak && !existing.isBreak) {
      await tx.timetableSlot.deleteMany({ where: { periodId: input.id } })
    }
    return tx.timetablePeriod.update({
      where: { id: input.id },
      data: {
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
        isBreak: input.isBreak,
        sortOrder: input.sortOrder,
      },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'timetable.update_period',
    module: 'timetable',
    entityType: 'TimetablePeriod',
    entityId: updated.id,
    summary: `Updated period ${updated.name} (${updated.startTime}–${updated.endTime})`,
    before: existing,
    after: updated,
  })
  return updated
}

/**
 * Removes a period and every lesson scheduled in it across all sections.
 * Cascade on TimetableSlot.periodId already deletes the slots.
 */
export async function deletePeriod(ctx: AppContext, id: string) {
  ctx.require('timetable.manage')

  const existing = await ctx.db.timetablePeriod.findFirst({
    where: { id },
    include: { _count: { select: { slots: true } } },
  })
  if (!existing) throw notFound('Period')

  await ctx.db.timetablePeriod.delete({ where: { id } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'timetable.delete_period',
    module: 'timetable',
    entityType: 'TimetablePeriod',
    entityId: id,
    summary: `Deleted period ${existing.name}${
      existing._count.slots > 0 ? ` and ${existing._count.slots} scheduled lessons` : ''
    }`,
    before: existing,
  })

  return { ok: true as const, slotsRemoved: existing._count.slots }
}

/**
 * Free/busy for one period slot: which teachers are already occupied. Used to
 * grey out impossible choices in the builder before the user picks them.
 */
export async function busyTeachers(
  ctx: AppContext,
  dayOfWeek: number,
  periodId: string,
  exceptSectionId?: string,
): Promise<Set<string>> {
  const slots = await ctx.db.timetableSlot.findMany({
    where: {
      dayOfWeek,
      periodId,
      teacherId: { not: null },
      ...(exceptSectionId ? { sectionId: { not: exceptSectionId } } : {}),
    },
    select: { teacherId: true },
  })
  return new Set(slots.map((s) => s.teacherId!).filter(Boolean))
}
