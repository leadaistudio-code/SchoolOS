import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest } from '@/server/api/response'
import { DAYS } from '@/server/modules/timetable/service'
import { capacityProblems, solveTimetable, type SolverDemand, type SolverSlot } from '@/lib/timetable-solver'

export type GeneratorData = Awaited<ReturnType<typeof generatorData>>

/** Everything the generator page edits: classes, their subjects' weekly needs, and teacher limits. */
export async function generatorData(ctx: AppContext) {
  ctx.require('timetable.manage')
  const [periods, classes, staff, slotCount] = await Promise.all([
    ctx.db.timetablePeriod.findMany({ orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }], select: { id: true, name: true, startTime: true, endTime: true, isBreak: true } }),
    ctx.db.classLevel.findMany({
      orderBy: { numeric: 'asc' },
      select: {
        id: true,
        name: true,
        sections: { where: { deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, subjects: { select: { classSubjectId: true } } } },
        subjects: {
          orderBy: { subject: { name: 'asc' } },
          select: {
            id: true,
            periodsPerWeek: true,
            maxPerDay: true,
            doublePeriod: true,
            teacherId: true,
            subject: { select: { name: true, deletedAt: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    ctx.db.staff.findMany({
      where: { deletedAt: null, classSubjects: { some: {} } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, timetableMaxPerDay: true, timetableUnavailable: true },
    }),
    ctx.db.timetableSlot.count(),
  ])
  return {
    periods,
    classes: classes
      .filter((c) => c.sections.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({
          id: s.id,
          name: s.name,
          // No SectionSubject rows means the section takes every subject of its class.
          subjectIds: s.subjects.length ? s.subjects.map((x) => x.classSubjectId) : null,
        })),
        subjects: c.subjects
          .filter((s) => !s.subject.deletedAt)
          .map((s) => ({
            id: s.id,
            name: s.subject.name,
            teacherId: s.teacherId,
            teacherName: s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}`.trim() : null,
            periodsPerWeek: s.periodsPerWeek,
            maxPerDay: s.maxPerDay,
            doublePeriod: s.doublePeriod,
          })),
      })),
    teachers: staff.map((t) => ({
      id: t.id,
      name: `${t.firstName} ${t.lastName}`.trim(),
      maxPerDay: t.timetableMaxPerDay,
      unavailable: t.timetableUnavailable,
    })),
    slotCount,
  }
}

export const requirementsSchema = z.array(
  z.object({
    classSubjectId: z.string().min(1),
    periodsPerWeek: z.number().int().min(0).max(48).nullable(),
    maxPerDay: z.number().int().min(1).max(12).nullable(),
    doublePeriod: z.boolean(),
  }),
).max(2000)

export async function saveRequirements(ctx: AppContext, raw: z.infer<typeof requirementsSchema>) {
  ctx.require('timetable.manage')
  const rows = requirementsSchema.parse(raw)
  const known = new Set((await ctx.db.classSubject.findMany({ where: { id: { in: rows.map((r) => r.classSubjectId) } }, select: { id: true } })).map((r) => r.id))
  await ctx.db.$transaction(
    rows
      .filter((r) => known.has(r.classSubjectId))
      .map((r) =>
        ctx.db.classSubject.update({
          where: { id: r.classSubjectId },
          data: { periodsPerWeek: r.periodsPerWeek, maxPerDay: r.maxPerDay, doublePeriod: r.doublePeriod },
        }),
      ),
  )
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'timetable.requirements',
    module: 'timetable',
    entityType: 'ClassSubject',
    entityId: 'bulk',
    summary: `Updated weekly lessons for ${known.size} class subjects`,
  })
  return known.size
}

export const teacherRuleSchema = z.object({
  staffId: z.string().min(1),
  maxPerDay: z.number().int().min(1).max(12).nullable(),
  unavailable: z.array(z.string().regex(/^[1-7]:[\w-]+$/)).max(100),
})

export async function saveTeacherRule(ctx: AppContext, raw: z.infer<typeof teacherRuleSchema>) {
  ctx.require('timetable.manage')
  const input = teacherRuleSchema.parse(raw)
  const res = await ctx.db.staff.updateMany({
    where: { id: input.staffId, deletedAt: null },
    data: { timetableMaxPerDay: input.maxPerDay, timetableUnavailable: [...new Set(input.unavailable)] },
  })
  if (res.count === 0) throw badRequest('Teacher not found')
}

export const generateSchema = z.object({
  sectionIds: z.array(z.string().min(1)).min(1, 'Pick at least one section').max(500),
  keepExisting: z.boolean(),
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  seed: z.number().int().min(1).max(2_000_000_000).optional(),
})

export type GenerateInput = z.infer<typeof generateSchema>

async function buildProblem(ctx: AppContext, input: GenerateInput) {
  const data = await generatorData(ctx)
  const chosen = new Set(input.sectionIds)
  const days = [...new Set(input.days)].sort()

  const existing = await ctx.db.timetableSlot.findMany({
    where: { dayOfWeek: { in: days } },
    select: { sectionId: true, dayOfWeek: true, periodId: true, classSubjectId: true, teacherId: true },
  })
  // Other sections' timetables always stay; chosen sections' only when kept.
  const fixed: SolverSlot[] = existing
    .filter((s) => s.classSubjectId && (!chosen.has(s.sectionId) || input.keepExisting))
    .map((s) => ({ sectionId: s.sectionId, day: s.dayOfWeek, periodId: s.periodId, classSubjectId: s.classSubjectId!, teacherId: s.teacherId }))
  const keptCount = new Map<string, number>()
  if (input.keepExisting) {
    for (const s of fixed) if (chosen.has(s.sectionId)) keptCount.set(`${s.sectionId}|${s.classSubjectId}`, (keptCount.get(`${s.sectionId}|${s.classSubjectId}`) ?? 0) + 1)
  }

  const demands: SolverDemand[] = []
  const sectionLabels = new Map<string, string>()
  const subjectLabels = new Map<string, string>()
  const sectionDemand: { id: string; label: string; demand: number }[] = []
  const missingRequirement: string[] = []
  for (const c of data.classes) {
    for (const s of c.sections) {
      sectionLabels.set(s.id, `${c.name} ${s.name}`)
      if (!chosen.has(s.id)) continue
      let total = 0
      for (const sub of c.subjects) {
        subjectLabels.set(sub.id, sub.name)
        if (s.subjectIds && !s.subjectIds.includes(sub.id)) continue
        if (sub.periodsPerWeek == null) {
          missingRequirement.push(`${c.name}: ${sub.name}`)
          continue
        }
        total += sub.periodsPerWeek
        demands.push({
          sectionId: s.id,
          classSubjectId: sub.id,
          teacherId: sub.teacherId,
          perWeek: Math.max(0, sub.periodsPerWeek - (keptCount.get(`${s.id}|${sub.id}`) ?? 0)),
          maxPerDay: sub.maxPerDay,
          double: sub.doublePeriod,
        })
      }
      sectionDemand.push({ id: s.id, label: `${c.name} ${s.name}`, demand: total })
    }
  }

  const teacherMaxPerDay: Record<string, number | null> = {}
  const teacherUnavailable: Record<string, string[]> = {}
  for (const t of data.teachers) {
    teacherMaxPerDay[t.id] = t.maxPerDay
    teacherUnavailable[t.id] = t.unavailable
  }
  const load = new Map<string, number>()
  for (const d of demands) if (d.teacherId) load.set(d.teacherId, (load.get(d.teacherId) ?? 0) + d.perWeek)
  for (const s of fixed) if (s.teacherId) load.set(s.teacherId, (load.get(s.teacherId) ?? 0) + 1)

  const teaching = data.periods.filter((p) => !p.isBreak)
  const problems = capacityProblems({
    days: days.length,
    teachingPeriods: teaching.length,
    sections: sectionDemand,
    teachers: data.teachers.map((t) => ({
      id: t.id,
      label: t.name,
      load: load.get(t.id) ?? 0,
      maxPerDay: t.maxPerDay,
      unavailable: t.unavailable.filter((k) => days.includes(Number(k.split(':')[0]))).length,
    })),
  })

  return {
    data,
    days,
    solverInput: {
      days,
      periods: data.periods.map((p) => ({ id: p.id, isBreak: p.isBreak })),
      demands,
      fixed,
      teacherMaxPerDay,
      teacherUnavailable,
    },
    sectionLabels,
    subjectLabels,
    problems,
    missingRequirement: [...new Set(missingRequirement)],
    noTeacher: [...new Set(demands.filter((d) => !d.teacherId && d.perWeek > 0).map((d) => `${sectionLabels.get(d.sectionId)}: ${subjectLabels.get(d.classSubjectId)}`))],
  }
}

export async function previewTimetable(ctx: AppContext, raw: GenerateInput) {
  ctx.require('timetable.manage')
  const input = generateSchema.parse(raw)
  const p = await buildProblem(ctx, input)
  if (p.data.periods.filter((x) => !x.isBreak).length === 0) throw badRequest('Add lesson periods to the school day first.')
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000_000) + 1
  const result = solveTimetable(p.solverInput, { seed })

  const teacherName = new Map(p.data.teachers.map((t) => [t.id, t.name]))
  return {
    seed: result.seed,
    placed: result.placed,
    wanted: result.wanted,
    problems: p.problems,
    missingRequirement: p.missingRequirement,
    noTeacher: p.noTeacher,
    unplaced: result.unplaced
      .map((u) => ({
        section: p.sectionLabels.get(u.sectionId) ?? '',
        subject: p.subjectLabels.get(u.classSubjectId) ?? '',
        missing: u.missing,
      }))
      .sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }) || a.subject.localeCompare(b.subject)),
    days: p.days.map((d) => ({ value: d, label: DAYS.find((x) => x.value === d)?.short ?? String(d) })),
    periods: p.data.periods,
    // Chosen sections only, kept lessons included, so the preview shows the whole week.
    grid: input.sectionIds.map((sectionId) => ({
      sectionId,
      label: p.sectionLabels.get(sectionId) ?? '',
      cells: [
        ...p.solverInput.fixed.filter((s) => s.sectionId === sectionId).map((s) => ({ ...s, kept: true })),
        ...result.slots.filter((s) => s.sectionId === sectionId).map((s) => ({ ...s, kept: false })),
      ].map((s) => ({
        day: s.day,
        periodId: s.periodId,
        subject: p.subjectLabels.get(s.classSubjectId) ?? '',
        teacher: s.teacherId ? teacherName.get(s.teacherId) ?? '' : '',
        kept: s.kept,
      })),
    })),
  }
}

/**
 * Re-solves with the previewed seed on current data and writes the result.
 * Nothing from the browser is written except the choices themselves, so a
 * stale or tampered preview cannot create a clash.
 */
export async function applyTimetable(ctx: AppContext, raw: GenerateInput & { seed: number }) {
  ctx.require('timetable.manage')
  const input = generateSchema.extend({ seed: z.number().int().min(1) }).parse(raw)
  const p = await buildProblem(ctx, input)
  const result = solveTimetable(p.solverInput, { seed: input.seed })

  const sections = await ctx.db.section.findMany({ where: { id: { in: input.sectionIds }, deletedAt: null }, select: { id: true, classLevelId: true } })
  const classOf = new Map(sections.map((s) => [s.id, s.classLevelId]))

  await ctx.db.$transaction(async (tx) => {
    if (!input.keepExisting) {
      await tx.timetableSlot.deleteMany({ where: { sectionId: { in: [...classOf.keys()] }, dayOfWeek: { in: p.days } } })
    }
    await tx.timetableSlot.createMany({
      data: result.slots
        .filter((s) => classOf.has(s.sectionId))
        .map((s) => ({
          tenantId: ctx.tenant.id,
          classLevelId: classOf.get(s.sectionId)!,
          sectionId: s.sectionId,
          periodId: s.periodId,
          dayOfWeek: s.day,
          classSubjectId: s.classSubjectId,
          teacherId: s.teacherId,
        })),
      skipDuplicates: true,
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'timetable.generate',
    module: 'timetable',
    entityType: 'Section',
    entityId: input.sectionIds.length === 1 ? input.sectionIds[0]! : 'bulk',
    summary: `Generated timetable for ${input.sectionIds.length} section(s): ${result.placed} of ${result.wanted} lessons placed${input.keepExisting ? ', existing lessons kept' : ''}`,
  })
  return { placed: result.placed, wanted: result.wanted, unplaced: result.unplaced.length }
}
