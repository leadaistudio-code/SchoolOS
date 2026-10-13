import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'
import { currentSession } from '@/server/modules/academics/service'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'
import { accessibleStudentIds, classLevelScopeWhere, isPortalOnlyRole } from '@/server/scope'
import { notify } from '@/server/notifications'
import { getDefaultReportCardTemplate } from './report-templates'
import { classSubjectAppliesToSection } from './section-subjects'
import { parseHolistic, parseReportCardConfig } from '@/lib/exams/report-card-config'
import { parentNamesFor } from '@/server/modules/students/parent-names'
import { computeCgpa, type ReportCardDocumentData } from '@/lib/exams/report-card-data'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

export const examCreateSchema = z
  .object({
    name: z.string().trim().min(3, 'Enter an exam name').max(100),
    kind: z.enum(['WEEKLY', 'MONTHLY', 'UNIT_TEST', 'MID_TERM', 'FINAL', 'PRACTICAL', 'CUSTOM']),
    startsOn: isoDate.optional(),
    endsOn: isoDate.optional(),
    gradingScaleId: z.string().min(1).optional(),
    classLevelIds: z.array(z.string().min(1)).min(1, 'Select at least one class'),
    classSubjectIds: z.array(z.string().min(1)).min(1, 'Select at least one subject'),
  })
  .refine(
    (value) => !value.startsOn || !value.endsOn || attendanceDate(value.endsOn) >= attendanceDate(value.startsOn),
    { path: ['endsOn'], message: 'The end date cannot be before the start date' },
  )

export const marksSaveSchema = z.object({
  rows: z
    .array(
      z.object({
        studentId: z.string().min(1),
        /** Total. Ignored when the written / internal / oral parts are sent. */
        marksObtained: z.coerce.number().min(0).max(1000).nullable(),
        writtenMarks: z.coerce.number().min(0).max(1000).nullable().optional(),
        internalMarks: z.coerce.number().min(0).max(1000).nullable().optional(),
        oralMarks: z.coerce.number().min(0).max(1000).nullable().optional(),
        isAbsent: z.coerce.boolean().default(false),
        notApplicable: z.coerce.boolean().default(false),
        remarks: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .min(1),
})

export const GRADING_SYSTEMS = ['GRADES', 'POINTS', 'DESCRIPTIVE', 'MARKS_ONLY'] as const

/** ALL_PAPERS: pass band overall and the pass mark in every paper. OVERALL: total percentage only. */
export const PASS_RULES = ['ALL_PAPERS', 'OVERALL'] as const
export type PassRule = (typeof PASS_RULES)[number]

export function resultPasses(
  scale: { passRule: string; passPercent: number },
  percentage: number,
  band: { isPass: boolean } | null | undefined,
  papers: Array<{ passMarks: number; marksObtained: number | null; isAbsent: boolean }>,
) {
  if (scale.passRule === 'OVERALL') return percentage >= scale.passPercent
  return band?.isPass === true && papers.every((paper) => !paper.isAbsent && (paper.marksObtained ?? 0) >= paper.passMarks)
}

const gradeBandInput = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object') return raw
    const band = raw as Record<string, unknown>
    return { ...band, min: band.min ?? band.minPercent, max: band.max ?? band.maxPercent }
  },
  z.object({
    grade: z.string().trim().min(1, 'Enter a label').max(30),
    min: z.coerce.number().min(0),
    max: z.coerce.number().min(0),
    points: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(0).max(100).nullable()),
    remark: z.string().trim().max(120).nullable().optional(),
    isPass: z.coerce.boolean().default(true),
  }),
)

/**
 * A school's own marking system. Bands are entered either as percentages or as
 * marks out of `outOf`; both are stored as percentages so every grading path
 * (results, report cards, registers) keeps working unchanged.
 */
export const gradingScaleSchema = z.object({
  name: z.string().trim().min(2, 'Enter a scale name').max(60),
  description: z.string().trim().max(300).nullable().optional(),
  isDefault: z.coerce.boolean().default(false),
  system: z.enum(GRADING_SYSTEMS).default('GRADES'),
  basis: z.enum(['PERCENT', 'MARKS']).default('PERCENT'),
  outOf: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().positive().max(10000).nullable()).optional(),
  passRule: z.enum(PASS_RULES).default('ALL_PAPERS'),
  passPercent: z.coerce.number().min(0).max(100).default(33),
  bands: z.array(gradeBandInput).min(1, 'Add at least one band').max(30, 'Use at most 30 bands'),
}).superRefine((value, context) => {
  const ceiling = value.basis === 'MARKS' ? value.outOf ?? 0 : 100
  if (value.basis === 'MARKS' && !value.outOf) context.addIssue({ code: 'custom', path: ['outOf'], message: 'Enter the total marks the bands are out of' })
  const labels = new Set<string>()
  value.bands.forEach((band, index) => {
    if (band.min > band.max) context.addIssue({ code: 'custom', path: ['bands', index, 'max'], message: '“To” must be at least “From”' })
    if (ceiling && band.max > ceiling) context.addIssue({ code: 'custom', path: ['bands', index, 'max'], message: `Cannot exceed ${ceiling}` })
    const key = band.grade.toLowerCase()
    if (labels.has(key)) context.addIssue({ code: 'custom', path: ['bands', index, 'grade'], message: `“${band.grade}” is used twice` })
    labels.add(key)
  })
  const sorted = value.bands.map((band, index) => ({ ...band, index })).sort((a, b) => a.min - b.min)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.min <= sorted[i - 1]!.max) {
      context.addIssue({ code: 'custom', path: ['bands', sorted[i]!.index], message: `${sorted[i]!.grade} overlaps ${sorted[i - 1]!.grade}` })
    }
  }
})
export type GradingScaleInput = z.infer<typeof gradingScaleSchema>

/** Bands as stored: percentages always, marks too when the scale is marks-based. */
export function gradeBandRows(input: GradingScaleInput) {
  const round = (n: number) => Math.round(n * 10000) / 10000
  return input.bands.map((band) => {
    const marks = input.basis === 'MARKS' && input.outOf
    return {
      grade: band.grade,
      minPercent: marks ? round((band.min / input.outOf!) * 100) : band.min,
      maxPercent: marks ? round((band.max / input.outOf!) * 100) : band.max,
      minMarks: marks ? band.min : null,
      maxMarks: marks ? band.max : null,
      points: input.system === 'POINTS' || input.system === 'GRADES' ? band.points ?? null : null,
      remark: band.remark || null,
      isPass: band.isPass,
    }
  })
}

export type GradeBandValue = { grade: string; minPercent: number; maxPercent: number; isPass: boolean }
export function gradeForPercent<T extends GradeBandValue>(percent: number, bands: T[]): T | null {
  const exact = bands.find((band) => percent >= band.minPercent && percent <= band.maxPercent)
  if (exact) return exact
  // Scores in a gap between bands (16.5 when bands are 0–16 and 17–24) take the band below.
  return [...bands].filter((band) => percent >= band.minPercent).sort((a, b) => b.minPercent - a.minPercent)[0] ?? null
}

/** Dense ranking: equal percentage + total share a rank; next rank skips. */
export function assignClassRanks(
  results: { id: string; percentage: number; totalObtained: number }[],
): { id: string; rank: number }[] {
  const sorted = [...results].sort(
    (a, b) => b.percentage - a.percentage || b.totalObtained - a.totalObtained,
  )
  let rank = 0
  let previous: { percentage: number; totalObtained: number } | null = null
  return sorted.map((result, index) => {
    if (
      !previous ||
      previous.percentage !== result.percentage ||
      previous.totalObtained !== result.totalObtained
    ) {
      rank = index + 1
    }
    previous = result
    return { id: result.id, rank }
  })
}

const optionalTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined))

/** Optional internal / oral part of a paper; blank or 0 means the paper has none. */
const componentValue = z
  .union([z.literal(''), z.null(), z.coerce.number().min(0).max(1000)])
  .transform((v) => (typeof v === 'number' && v > 0 ? v : null))
const componentMax = componentValue.optional().transform((v) => v ?? null)

function componentsFit(
  paper: { maxMarks: number; internalMaxMarks?: number | null; oralMaxMarks?: number | null },
  context: z.RefinementCtx,
  path: (string | number)[] = [],
) {
  const parts = (paper.internalMaxMarks ?? 0) + (paper.oralMaxMarks ?? 0)
  if (parts >= paper.maxMarks) {
    context.addIssue({ code: 'custom', path: [...path, 'maxMarks'], message: 'Internal + oral marks must be less than the paper total' })
  }
}

/** The written / theory part of a paper: the total less any internal and oral parts. */
export function writtenMax(paper: { maxMarks: number; internalMaxMarks?: number | null; oralMaxMarks?: number | null }) {
  return paper.maxMarks - (paper.internalMaxMarks ?? 0) - (paper.oralMaxMarks ?? 0)
}

export const examPaperUpdateSchema = z.object({
  papers: z
    .array(
      z.object({
        id: z.string().min(1),
        /** Paper total, including internal and oral parts. */
        maxMarks: z.coerce.number().positive().max(1000),
        passMarks: z.coerce.number().min(0).max(1000),
        /** Omitted (e.g. spreadsheet import) keeps the paper's current parts. */
        internalMaxMarks: componentValue.optional(),
        oralMaxMarks: componentValue.optional(),
        examDate: isoDate.optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
        startTime: optionalTime,
        endTime: optionalTime,
        roomName: z
          .string()
          .trim()
          .max(80)
          .optional()
          .or(z.literal(''))
          .transform((v) => (v ? v : undefined)),
      }),
    )
    .min(1),
}).superRefine((value, context) => {
  for (const [index, paper] of value.papers.entries()) {
    if (paper.passMarks > paper.maxMarks) {
      context.addIssue({
        code: 'custom',
        path: ['papers', index, 'passMarks'],
        message: 'Pass marks cannot exceed maximum marks',
      })
    }
    if (paper.internalMaxMarks !== undefined || paper.oralMaxMarks !== undefined) componentsFit(paper, context, ['papers', index])
  }
})

export const addExamPaperSchema = z
  .object({
    classSubjectId: z.string().min(1, 'Select a subject'),
    /** Paper total, including internal and oral parts. */
    maxMarks: z.coerce.number().positive().max(1000).default(100),
    passMarks: z.coerce.number().min(0).max(1000).default(33),
    internalMaxMarks: componentMax,
    oralMaxMarks: componentMax,
    examDate: isoDate.optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
    startTime: optionalTime,
    endTime: optionalTime,
    roomName: z
      .string()
      .trim()
      .max(80)
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : undefined)),
  })
  .superRefine((value, context) => {
    if (value.passMarks > value.maxMarks) {
      context.addIssue({
        code: 'custom',
        path: ['passMarks'],
        message: 'Pass marks cannot exceed maximum marks',
      })
    }
    componentsFit(value, context)
  })

export const examMetaUpdateSchema = z
  .object({
    name: z.string().trim().min(3).max(100).optional(),
    startsOn: isoDate.optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
    endsOn: isoDate.optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
    status: z.enum(['DRAFT', 'SCHEDULED', 'ONGOING', 'MARKS_ENTRY', 'PUBLISHED', 'ARCHIVED']).optional(),
  })
  .refine(
    (value) =>
      !value.startsOn ||
      !value.endsOn ||
      attendanceDate(value.endsOn) >= attendanceDate(value.startsOn),
    { path: ['endsOn'], message: 'The end date cannot be before the start date' },
  )

const EXAM_SORT_FIELDS = ['createdAt', 'name', 'startsOn', 'status'] as const

export async function examSetup(ctx: AppContext) {
  ctx.require('exams.manage')
  const session = await currentSession(ctx)
  const classes = await ctx.db.classLevel.findMany({
    where: { sessionId: session.id, deletedAt: null },
    orderBy: { numeric: 'asc' },
    select: {
      id: true,
      name: true,
      subjects: {
        orderBy: { subject: { name: 'asc' } },
        select: {
          id: true,
          subject: { select: { name: true, code: true } },
          sections: {
            select: {
              section: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  })
  const scales = await ctx.db.gradingScale.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true, isDefault: true } })
  return { session: { id: session.id, name: session.name }, classes, scales }
}

export async function createExam(ctx: AppContext, input: z.infer<typeof examCreateSchema>) {
  ctx.require('exams.manage')
  const session = await currentSession(ctx)

  const classLevels = await ctx.db.classLevel.findMany({
    where: { id: { in: input.classLevelIds }, sessionId: session.id, deletedAt: null },
    select: { id: true },
  })
  if (classLevels.length !== new Set(input.classLevelIds).size) throw notFound('Class')

  const subjects = await ctx.db.classSubject.findMany({
    where: { id: { in: input.classSubjectIds }, classLevelId: { in: input.classLevelIds } },
    select: { id: true },
  })
  if (subjects.length !== new Set(input.classSubjectIds).size) {
    throw conflict('Every selected subject must belong to a selected class')
  }
  if (input.gradingScaleId) {
    const scale = await ctx.db.gradingScale.findFirst({ where: { id: input.gradingScaleId } })
    if (!scale) throw notFound('Grading scale')
  }

  const existing = await ctx.db.exam.findFirst({ where: { sessionId: session.id, name: input.name } })
  if (existing) throw conflict(`An exam named ${input.name} already exists in ${session.name}`)

  const created = await ctx.db.exam.create({
    data: {
      tenantId: ctx.tenant.id,
      sessionId: session.id,
      name: input.name,
      kind: input.kind,
      startsOn: input.startsOn ? attendanceDate(input.startsOn) : null,
      endsOn: input.endsOn ? attendanceDate(input.endsOn) : null,
      gradingScaleId: input.gradingScaleId ?? null,
      status: input.startsOn ? 'SCHEDULED' : 'DRAFT',
      classes: { create: classLevels.map((item) => ({ tenantId: ctx.tenant.id, classLevelId: item.id })) },
      subjects: { create: subjects.map((item) => ({ tenantId: ctx.tenant.id, classSubjectId: item.id })) },
    },
    include: { classes: true, subjects: true },
  })
  await audit({
    tenantId: ctx.tenant.id, actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'exam.create', module: 'exams', entityType: 'Exam', entityId: created.id,
    summary: `Created ${created.name}`, after: created,
  })
  return created
}

export async function listGradingScales(ctx: AppContext) {
  ctx.require('exams.manage')
  return ctx.db.gradingScale.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { bands: { orderBy: { minPercent: 'desc' } }, _count: { select: { exams: true } } },
  })
}

function scaleFields(input: GradingScaleInput) {
  return {
    name: input.name,
    description: input.description || null,
    isDefault: input.isDefault,
    system: input.system,
    basis: input.basis,
    outOf: input.basis === 'MARKS' ? input.outOf ?? null : null,
    passRule: input.passRule,
    passPercent: input.passPercent,
  }
}

export async function createGradingScale(ctx: AppContext, input: GradingScaleInput) {
  ctx.require('exams.manage')
  const existing = await ctx.db.gradingScale.findFirst({ where: { name: input.name } })
  if (existing) throw conflict(`A grading scale named ${input.name} already exists`)
  const anyScale = await ctx.db.gradingScale.count()
  const isDefault = input.isDefault || anyScale === 0
  const scale = await ctx.db.$transaction(async (tx) => {
    if (isDefault) await tx.gradingScale.updateMany({ data: { isDefault: false } })
    return tx.gradingScale.create({ data: {
      tenantId: ctx.tenant.id, ...scaleFields(input), isDefault,
      bands: { create: gradeBandRows(input).map((band) => ({ tenantId: ctx.tenant.id, ...band })) },
    }, include: { bands: true } })
  })
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'grading_scale.create', module: 'exams', entityType: 'GradingScale', entityId: scale.id, summary: `Created grading scale ${scale.name}`, after: scale })
  return scale
}

export async function updateGradingScale(ctx: AppContext, id: string, input: GradingScaleInput) {
  ctx.require('exams.manage')
  const before = await ctx.db.gradingScale.findFirst({ where: { id }, include: { bands: true } })
  if (!before) throw notFound('Grading scale')
  const clash = await ctx.db.gradingScale.findFirst({ where: { name: input.name, id: { not: id } }, select: { id: true } })
  if (clash) throw conflict(`A grading scale named ${input.name} already exists`)
  const published = await ctx.db.exam.findFirst({ where: { gradingScaleId: id, status: 'PUBLISHED' }, select: { name: true } })
  if (published) throw conflict(`${published.name} has published results on this scale. Duplicate the scale and edit the copy instead.`)
  // The default flag can only move to another scale, never be switched off here.
  const isDefault = input.isDefault || before.isDefault
  const scale = await ctx.db.$transaction(async (tx) => {
    if (isDefault && !before.isDefault) await tx.gradingScale.updateMany({ data: { isDefault: false } })
    await tx.gradeBand.deleteMany({ where: { scaleId: id } })
    return tx.gradingScale.update({
      where: { id },
      data: {
        ...scaleFields(input),
        isDefault,
        bands: { create: gradeBandRows(input).map((band) => ({ tenantId: ctx.tenant.id, ...band })) },
      },
      include: { bands: true },
    })
  })
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'grading_scale.update', module: 'exams', entityType: 'GradingScale', entityId: id, summary: `Updated grading scale ${scale.name}`, before, after: scale })
  return scale
}

export const passRuleSchema = z.object({
  passRule: z.enum(PASS_RULES),
  passPercent: z.coerce.number().min(0, 'Use 0 to 100').max(100, 'Use 0 to 100'),
})

/**
 * Changes only how pass / fail is decided, so it is allowed on a scale with
 * published results; exams that already have results are recalculated.
 */
export async function setGradingScalePassRule(ctx: AppContext, id: string, input: z.infer<typeof passRuleSchema>) {
  ctx.require('exams.manage')
  const before = await ctx.db.gradingScale.findFirst({ where: { id }, select: { id: true, name: true, passRule: true, passPercent: true } })
  if (!before) throw notFound('Grading scale')
  const scale = await ctx.db.gradingScale.update({ where: { id }, data: { passRule: input.passRule, passPercent: input.passPercent }, select: { id: true, name: true, passRule: true, passPercent: true } })
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'grading_scale.pass_rule', module: 'exams', entityType: 'GradingScale', entityId: id, summary: `Changed pass rule of ${scale.name}`, before, after: scale })
  const exams = await ctx.db.exam.findMany({ where: { gradingScaleId: id, results: { some: {} } }, select: { id: true } })
  let recalculated = 0
  for (const exam of exams) recalculated += (await computeResults(ctx, exam.id)).calculated
  return { exams: exams.length, recalculated }
}

export async function setDefaultGradingScale(ctx: AppContext, id: string) {
  ctx.require('exams.manage')
  const scale = await ctx.db.gradingScale.findFirst({ where: { id }, select: { id: true, name: true } })
  if (!scale) throw notFound('Grading scale')
  await ctx.db.$transaction(async (tx) => {
    await tx.gradingScale.updateMany({ data: { isDefault: false } })
    await tx.gradingScale.update({ where: { id }, data: { isDefault: true } })
  })
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'grading_scale.default', module: 'exams', entityType: 'GradingScale', entityId: id, summary: `Made ${scale.name} the default grading scale` })
  return scale
}

export async function deleteGradingScale(ctx: AppContext, id: string) {
  ctx.require('exams.manage')
  const scale = await ctx.db.gradingScale.findFirst({ where: { id }, include: { bands: true, _count: { select: { exams: true } } } })
  if (!scale) throw notFound('Grading scale')
  if (scale._count.exams > 0) throw conflict(`${scale.name} is used by ${scale._count.exams} exam(s). Switch those exams to another scale first.`)
  if (scale.isDefault) throw conflict('Make another scale the default before deleting this one')
  await ctx.db.gradingScale.delete({ where: { id } })
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'grading_scale.delete', module: 'exams', entityType: 'GradingScale', entityId: id, summary: `Deleted grading scale ${scale.name}`, before: scale })
  return scale
}

export async function listExams(ctx: AppContext, query: ListQuery) {
  ctx.require('exams.view')
  const classScope = await classLevelScopeWhere(ctx)
  const scoped = Object.keys(classScope).length > 0
  const portal = isPortalOnlyRole(ctx.user.roleKeys)
  const where: Prisma.ExamWhereInput = {
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    // Students/parents see assigned exams once scheduled — not only after results publish.
    ...(portal
      ? { status: { in: ['SCHEDULED', 'ONGOING', 'MARKS_ENTRY', 'PUBLISHED'] } }
      : {}),
    ...(scoped ? { classes: { some: { classLevel: classScope } } } : {}),
  }
  const [rows, total] = await Promise.all([
    ctx.db.exam.findMany({
      where, orderBy: orderByFrom(query.sort, query.dir, EXAM_SORT_FIELDS, { createdAt: 'desc' }), ...skipTake(query),
      select: {
        id: true,
        name: true,
        kind: true,
        status: true,
        startsOn: true,
        endsOn: true,
        gradingScaleId: true,
        gradingScale: { select: { name: true } },
        _count: {
          select: {
            classes: scoped ? { where: { classLevel: classScope } } : true,
            subjects: scoped ? { where: { classSubject: { classLevel: classScope } } } : true,
          },
        },
      },
    }),
    ctx.db.exam.count({ where }),
  ])
  return { rows, total }
}

export async function setExamGradingScale(ctx: AppContext, examId: string, gradingScaleId: string) {
  ctx.require('exams.manage')
  const [exam, scale] = await Promise.all([
    ctx.db.exam.findFirst({ where: { id: examId }, select: { id: true, name: true, status: true, gradingScaleId: true } }),
    ctx.db.gradingScale.findFirst({ where: { id: gradingScaleId }, select: { id: true, name: true } }),
  ])
  if (!exam) throw notFound('Exam')
  if (!scale) throw notFound('Grading scale')
  if (exam.status === 'PUBLISHED') throw conflict('The grading scale cannot be changed after publishing')
  const updated = await ctx.db.exam.update({ where: { id: examId }, data: { gradingScaleId } })
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'exam.grading_scale.set', module: 'exams', entityType: 'Exam', entityId: examId, summary: `Set ${scale.name} as the grading scale for ${exam.name}`, before: { gradingScaleId: exam.gradingScaleId }, after: { gradingScaleId } })
  return updated
}

export async function getExamDetail(ctx: AppContext, examId: string) {
  ctx.require('exams.view')
  const classScope = await classLevelScopeWhere(ctx)
  const scoped = Object.keys(classScope).length > 0
  const studentIds = await accessibleStudentIds(ctx)
  const portal = isPortalOnlyRole(ctx.user.roleKeys)
  const exam = await ctx.db.exam.findFirst({
    where: {
      id: examId,
      ...(portal
        ? { status: { in: ['SCHEDULED', 'ONGOING', 'MARKS_ENTRY', 'PUBLISHED'] } }
        : {}),
      ...(scoped ? { classes: { some: { classLevel: classScope } } } : {}),
    },
    include: {
      gradingScale: { select: { id: true, name: true } },
      classes: {
        ...(scoped ? { where: { classLevel: classScope } } : {}),
        include: { classLevel: { select: { id: true, name: true } } },
        orderBy: { classLevel: { numeric: 'asc' } },
      },
      subjects: {
        ...(scoped ? { where: { classSubject: { classLevel: classScope } } } : {}),
        orderBy: [
          { classSubject: { classLevel: { numeric: 'asc' } } },
          { classSubject: { subject: { name: 'asc' } } },
        ],
        include: {
          classSubject: {
            select: {
              classLevel: { select: { name: true } },
              subject: { select: { name: true, code: true } },
              sections: {
                select: { section: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
      _count: {
        select: {
          results: studentIds === null
            ? true
            : { where: { studentId: { in: studentIds } } },
        },
      },
    },
  })
  if (!exam) throw notFound('Exam')
  return exam
}

export async function updateExamMeta(
  ctx: AppContext,
  examId: string,
  raw: z.infer<typeof examMetaUpdateSchema>,
) {
  ctx.require('exams.manage')
  const input = examMetaUpdateSchema.parse(raw)
  const exam = await ctx.db.exam.findFirst({ where: { id: examId } })
  if (!exam) throw notFound('Exam')
  if (exam.status === 'PUBLISHED' && input.status && input.status !== 'ARCHIVED' && input.status !== 'PUBLISHED') {
    throw conflict('Published exams can only be archived')
  }
  if (exam.status === 'PUBLISHED' && (input.name || input.startsOn || input.endsOn)) {
    throw conflict('Published exam details cannot be changed; archive instead')
  }

  const nextStatus =
    input.status && input.status !== exam.status
      ? input.status === 'PUBLISHED'
        ? undefined
        : input.status
      : undefined

  const updated = await ctx.db.exam.update({
    where: { id: examId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.startsOn !== undefined
        ? { startsOn: input.startsOn ? attendanceDate(input.startsOn) : null }
        : {}),
      ...(input.endsOn !== undefined
        ? { endsOn: input.endsOn ? attendanceDate(input.endsOn) : null }
        : {}),
      ...(nextStatus ? { status: nextStatus } : {}),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'exam.update',
    module: 'exams',
    entityType: 'Exam',
    entityId: examId,
    summary: `Updated exam ${updated.name}`,
    before: { name: exam.name, status: exam.status },
    after: { name: updated.name, status: updated.status },
  })
  return updated
}

export async function updateExamPapers(
  ctx: AppContext,
  examId: string,
  raw: z.infer<typeof examPaperUpdateSchema>,
) {
  ctx.require('exams.manage')
  const input = examPaperUpdateSchema.parse(raw)
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId },
    select: { id: true, name: true, status: true, subjects: { select: { id: true, internalMaxMarks: true, oralMaxMarks: true } } },
  })
  if (!exam) throw notFound('Exam')
  if (exam.status === 'PUBLISHED') throw conflict('Papers cannot be changed after publishing')

  const current = new Map(exam.subjects.map((s) => [s.id, s]))
  if (input.papers.some((p) => !current.has(p.id))) {
    throw conflict('One or more papers do not belong to this exam')
  }
  for (const paper of input.papers) {
    const existing = current.get(paper.id)!
    const internal = paper.internalMaxMarks !== undefined ? paper.internalMaxMarks : existing.internalMaxMarks
    const oral = paper.oralMaxMarks !== undefined ? paper.oralMaxMarks : existing.oralMaxMarks
    if ((internal ?? 0) + (oral ?? 0) >= paper.maxMarks) {
      throw conflict('Internal + oral marks must be less than the paper total')
    }
  }

  await ctx.db.$transaction(async (tx) => {
    for (const paper of input.papers) {
      await tx.examSubject.update({
        where: { id: paper.id },
        data: {
          maxMarks: paper.maxMarks,
          passMarks: paper.passMarks,
          ...(paper.internalMaxMarks !== undefined ? { internalMaxMarks: paper.internalMaxMarks } : {}),
          ...(paper.oralMaxMarks !== undefined ? { oralMaxMarks: paper.oralMaxMarks } : {}),
          examDate: paper.examDate ? attendanceDate(paper.examDate) : null,
          startTime: paper.startTime ?? null,
          endTime: paper.endTime ?? null,
          roomName: paper.roomName ?? null,
        },
      })
    }
    if (exam.status === 'DRAFT' && input.papers.some((p) => p.examDate)) {
      await tx.exam.update({ where: { id: examId }, data: { status: 'SCHEDULED' } })
    }
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'exam.papers.update',
    module: 'exams',
    entityType: 'Exam',
    entityId: examId,
    summary: `Updated ${input.papers.length} papers for ${exam.name}`,
  })
  return { updated: input.papers.length }
}

export type AvailableExamPaperOption = {
  id: string
  label: string
  className: string
  subjectName: string
  subjectCode: string
}

/** Class subjects mapped to this exam’s classes that are not yet papers. */
export async function listAvailableExamPapers(
  ctx: AppContext,
  examId: string,
): Promise<AvailableExamPaperOption[]> {
  ctx.require('exams.manage')
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId },
    select: {
      classes: { select: { classLevelId: true } },
      subjects: { select: { classSubjectId: true } },
    },
  })
  if (!exam) throw notFound('Exam')

  const classLevelIds = exam.classes.map((row) => row.classLevelId)
  if (classLevelIds.length === 0) return []

  const taken = new Set(exam.subjects.map((row) => row.classSubjectId))
  const candidates = await ctx.db.classSubject.findMany({
    where: { classLevelId: { in: classLevelIds } },
    orderBy: [
      { classLevel: { numeric: 'asc' } },
      { subject: { name: 'asc' } },
    ],
    select: {
      id: true,
      classLevel: { select: { name: true } },
      subject: { select: { name: true, code: true } },
    },
  })

  return candidates
    .filter((row) => !taken.has(row.id))
    .map((row) => ({
      id: row.id,
      className: row.classLevel.name,
      subjectName: row.subject.name,
      subjectCode: row.subject.code,
      label: `${row.classLevel.name} · ${row.subject.name} (${row.subject.code})`,
    }))
}

/** Adds one paper (class + subject) to an existing exam, with optional schedule. */
export async function addExamPaper(
  ctx: AppContext,
  examId: string,
  raw: z.infer<typeof addExamPaperSchema>,
) {
  ctx.require('exams.manage')
  const input = addExamPaperSchema.parse(raw)
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId },
    select: {
      id: true,
      name: true,
      status: true,
      classes: { select: { classLevelId: true } },
      subjects: { select: { classSubjectId: true } },
    },
  })
  if (!exam) throw notFound('Exam')
  if (exam.status === 'PUBLISHED') throw conflict('Papers cannot be added after publishing')

  const classLevelIds = exam.classes.map((row) => row.classLevelId)
  if (classLevelIds.length === 0) {
    throw conflict('Add at least one class to this exam before adding papers')
  }
  if (exam.subjects.some((row) => row.classSubjectId === input.classSubjectId)) {
    throw conflict('That paper is already on this exam')
  }

  const classSubject = await ctx.db.classSubject.findFirst({
    where: {
      id: input.classSubjectId,
      classLevelId: { in: classLevelIds },
    },
    select: {
      id: true,
      classLevel: { select: { name: true } },
      subject: { select: { name: true, code: true } },
    },
  })
  if (!classSubject) {
    throw conflict('Choose a subject that belongs to a class on this exam')
  }

  const created = await ctx.db.$transaction(async (tx) => {
    const paper = await tx.examSubject.create({
      data: {
        tenantId: ctx.tenant.id,
        examId,
        classSubjectId: classSubject.id,
        maxMarks: input.maxMarks,
        passMarks: input.passMarks,
        internalMaxMarks: input.internalMaxMarks,
        oralMaxMarks: input.oralMaxMarks,
        examDate: input.examDate ? attendanceDate(input.examDate) : null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        roomName: input.roomName ?? null,
      },
    })
    if (exam.status === 'DRAFT' && input.examDate) {
      await tx.exam.update({ where: { id: examId }, data: { status: 'SCHEDULED' } })
    }
    return paper
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'exam.paper.add',
    module: 'exams',
    entityType: 'ExamSubject',
    entityId: created.id,
    summary: `Added ${classSubject.classLevel.name} · ${classSubject.subject.name} to ${exam.name}`,
  })

  return created
}

export async function examMarksSetup(ctx: AppContext, examId: string) {
  ctx.require('exams.marks')
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId },
    select: {
      id: true, name: true,
      subjects: {
        orderBy: [
          { classSubject: { classLevel: { numeric: 'asc' } } },
          { classSubject: { subject: { name: 'asc' } } },
        ],
        select: {
          id: true,
          maxMarks: true,
          classSubject: {
            select: {
              classLevel: { select: { id: true, name: true, numeric: true } },
              subject: { select: { id: true, name: true } },
              teacherId: true,
            },
          },
        },
      },
    },
  })
  if (!exam) throw notFound('Exam')
  if (ctx.can('exams.manage')) return exam
  const staff = await ctx.db.staff.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } })
  return { ...exam, subjects: exam.subjects.filter((subject) => subject.classSubject.teacherId === staff?.id) }
}

export async function marksRoster(ctx: AppContext, examId: string, examSubjectId: string) {
  ctx.require('exams.marks')
  const subject = await ctx.db.examSubject.findFirst({
    where: { id: examSubjectId, examId },
    select: {
      id: true,
      maxMarks: true,
      passMarks: true,
      internalMaxMarks: true,
      oralMaxMarks: true,
      marksStatus: true,
      exam: { select: { id: true, name: true, sessionId: true, status: true } },
      classSubject: {
        select: {
          classLevelId: true,
          subject: { select: { name: true } },
          teacherId: true,
          sections: { select: { sectionId: true } },
        },
      },
    },
  })
  if (!subject) throw notFound('Exam subject')
  if (!ctx.can('exams.manage')) {
    const staff = await ctx.db.staff.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } })
    if (!staff || subject.classSubject.teacherId !== staff.id) throw notFound('Exam subject')
  }
  const mappedSectionIds = subject.classSubject.sections.map((row) => row.sectionId)
  const students = await ctx.db.enrollment.findMany({
    where: {
      sessionId: subject.exam.sessionId,
      classLevelId: subject.classSubject.classLevelId,
      isCurrent: true,
      student: { deletedAt: null },
    },
    orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
    select: {
      studentId: true,
      rollNumber: true,
      sectionId: true,
      student: { select: { admissionNo: true, firstName: true, lastName: true } },
    },
  })
  const eligible = students.filter((enrollment) =>
    classSubjectAppliesToSection(mappedSectionIds, enrollment.sectionId),
  )
  const marks = await ctx.db.mark.findMany({ where: { examSubjectId }, select: { studentId: true, marksObtained: true, internalMarks: true, oralMarks: true, isAbsent: true, notApplicable: true, remarks: true } })
  const byStudent = new Map(marks.map((mark) => [mark.studentId, mark]))
  return {
    exam: subject.exam,
    subject: subject.classSubject.subject,
    maxMarks: subject.maxMarks,
    passMarks: subject.passMarks,
    internalMaxMarks: subject.internalMaxMarks,
    oralMaxMarks: subject.oralMaxMarks,
    marksStatus: subject.marksStatus,
    rows: eligible.map((enrollment) => ({ ...enrollment, mark: byStudent.get(enrollment.studentId) ?? null })),
  }
}

type MarkRowInput = Omit<z.infer<typeof marksSaveSchema>['rows'][number], 'notApplicable'> & { notApplicable?: boolean }

/**
 * Turns one entered row into stored values. When the written / internal / oral
 * parts are sent, each is checked against its own maximum and the total is
 * their sum; a plain total (spreadsheet import) clears the parts.
 */
export function resolveMarkParts(
  row: MarkRowInput,
  paper: { maxMarks: number; internalMaxMarks: number | null; oralMaxMarks: number | null },
) {
  if (row.notApplicable) return { ...row, isAbsent: false, marksObtained: null, internalMarks: null, oralMarks: null }
  const hasParts = row.writtenMarks !== undefined || row.internalMarks !== undefined || row.oralMarks !== undefined
  if (!hasParts || row.isAbsent) {
    return { ...row, internalMarks: null, oralMarks: null }
  }
  const written = row.writtenMarks ?? null
  const internal = paper.internalMaxMarks ? row.internalMarks ?? null : null
  const oral = paper.oralMaxMarks ? row.oralMarks ?? null : null
  const limit = writtenMax(paper)
  if (written !== null && written > limit) throw conflict(`Written marks cannot be more than ${limit}`)
  if (internal !== null && internal > paper.internalMaxMarks!) throw conflict(`Internal marks cannot be more than ${paper.internalMaxMarks}`)
  if (oral !== null && oral > paper.oralMaxMarks!) throw conflict(`Oral marks cannot be more than ${paper.oralMaxMarks}`)
  const parts = [written, internal, oral].filter((v): v is number => v !== null)
  const total = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100 : null
  return { ...row, marksObtained: total, internalMarks: internal, oralMarks: oral }
}

export async function saveMarks(
  ctx: AppContext,
  examId: string,
  examSubjectId: string,
  input: z.infer<typeof marksSaveSchema>,
  options: { csv?: boolean } = {},
) {
  const roster = await marksRoster(ctx, examId, examSubjectId)
  if (roster.marksStatus === 'LOCKED') throw conflict('This marks sheet is locked. Ask an administrator to unlock it.')
  if (roster.marksStatus === 'SUBMITTED' && !ctx.can('exams.manage')) {
    throw conflict('This marks sheet has been submitted. Ask an administrator to reopen it.')
  }
  const source: 'CSV_IMPORT' | 'ADMIN_MANUAL' | 'TEACHER_MANUAL' = options.csv ? 'CSV_IMPORT' : ctx.can('exams.manage') ? 'ADMIN_MANUAL' : 'TEACHER_MANUAL'
  const allowed = new Set(roster.rows.map((row) => row.studentId))
  const unique = new Set(input.rows.map((row) => row.studentId))
  if (unique.size !== input.rows.length || input.rows.some((row) => !allowed.has(row.studentId))) throw conflict('Marks can only be entered for students in this class')
  const resolved = input.rows.map((row) => resolveMarkParts(row, roster))
  // A row with no mark and not absent is "not entered yet": the grid saves the
  // students that are filled in, and clearing a saved mark removes it.
  const blank = resolved.filter((row) => !row.isAbsent && !row.notApplicable && row.marksObtained === null)
  const rows = resolved.filter((row) => row.isAbsent || row.notApplicable || row.marksObtained !== null)
  const tooHigh = rows.find((row) => !row.isAbsent && !row.notApplicable && row.marksObtained! > roster.maxMarks)
  if (tooHigh) throw conflict(`Enter a mark from 0 to ${roster.maxMarks}, or mark the student absent`)
  let cleared = 0
  await ctx.db.$transaction(async (tx) => {
    if (blank.length > 0) {
      const removed = await tx.mark.deleteMany({
        where: { examSubjectId, studentId: { in: blank.map((row) => row.studentId) } },
      })
      cleared = removed.count
    }
    for (const row of rows) {
      const percent = row.marksObtained === null ? null : (row.marksObtained / roster.maxMarks) * 100
      const values = {
        marksObtained: row.isAbsent ? null : row.marksObtained,
        internalMarks: row.isAbsent ? null : row.internalMarks,
        oralMarks: row.isAbsent ? null : row.oralMarks,
        isAbsent: row.isAbsent,
        notApplicable: row.notApplicable ?? false,
        remarks: row.remarks ?? null,
        enteredById: ctx.user.userId,
        source,
      }
      await tx.mark.upsert({
        where: { tenantId_examSubjectId_studentId: { tenantId: ctx.tenant.id, examSubjectId, studentId: row.studentId } },
        create: { tenantId: ctx.tenant.id, examSubjectId, studentId: row.studentId, ...values, grade: percent === null ? null : undefined },
        update: values,
      })
    }
    if (rows.length > 0) {
      await tx.exam.updateMany({
        where: { id: examId, status: { in: ['DRAFT', 'SCHEDULED', 'ONGOING'] } },
        data: { status: 'MARKS_ENTRY' },
      })
    }
  })
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: options.csv ? 'exam.marks.import' : 'exam.marks.save', module: 'exams', entityType: 'ExamSubject', entityId: examSubjectId, summary: `${options.csv ? 'Imported' : 'Saved'} marks for ${roster.subject.name} in ${roster.exam.name}`, after: { students: rows.length, cleared, notEntered: blank.length - cleared, source } })
  return { saved: rows.length, cleared, notEntered: blank.length - cleared }
}

/**
 * Calculates results for every student whose applicable papers all have a mark
 * (or absent). A paper applies to a student when it is mapped to their section
 * (or to no section) and has not been closed without marks. Students still
 * waiting on marks are skipped and any stale draft result for them is removed.
 */
export async function computeResults(ctx: AppContext, examId: string, options: { classLevelId?: string } = {}) {
  ctx.require('exams.manage')
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId },
    include: {
      gradingScale: { include: { bands: true } },
      classes: { select: { classLevelId: true, classLevel: { select: { name: true } } } },
      subjects: {
        where: { closedWithoutMarks: false },
        select: {
          id: true,
          maxMarks: true,
          passMarks: true,
          classSubject: { select: { classLevelId: true, subject: { select: { name: true, isElective: true } }, sections: { select: { sectionId: true } } } },
        },
      },
    },
  })
  if (!exam) throw notFound('Exam')
  if (!exam.gradingScale) throw conflict('Choose a grading scale before computing results')
  // Recalculating a published exam (after a paper is reopened and marked)
  // keeps every result published, including students who only now qualify.
  const publishedAt = exam.status === 'PUBLISHED' ? exam.publishedAt ?? new Date() : null
  const classes = options.classLevelId ? exam.classes.filter((row) => row.classLevelId === options.classLevelId) : exam.classes
  if (options.classLevelId && classes.length === 0) throw notFound('Class in this exam')

  let calculated = 0
  let skipped = 0
  let removed = 0
  const waitingOn = new Map<string, number>()
  const resultIdsByClass = new Map<string, string[]>()
  for (const examClass of classes) {
    const classSubjects = exam.subjects.filter((subject) => subject.classSubject.classLevelId === examClass.classLevelId)
    if (classSubjects.length === 0) continue
    const enrollments = await ctx.db.enrollment.findMany({
      where: { sessionId: exam.sessionId, classLevelId: examClass.classLevelId, isCurrent: true, student: { deletedAt: null } },
      select: { studentId: true, sectionId: true },
    })
    const studentIds = enrollments.map((row) => row.studentId)
    const marks = await ctx.db.mark.findMany({
      where: { examSubjectId: { in: classSubjects.map((subject) => subject.id) }, studentId: { in: studentIds } },
      select: { studentId: true, examSubjectId: true, marksObtained: true, isAbsent: true, notApplicable: true },
    })
    const marksByStudent = new Map<string, typeof marks>()
    for (const mark of marks) marksByStudent.set(mark.studentId, [...(marksByStudent.get(mark.studentId) ?? []), mark])
    const subjectById = new Map(classSubjects.map((subject) => [subject.id, subject]))
    const skippedIds: string[] = []
    for (const { studentId, sectionId } of enrollments) {
      const own = marksByStudent.get(studentId) ?? []
      const marked = new Set(own.map((mark) => mark.examSubjectId))
      const notApplicable = new Set(own.filter((mark) => mark.notApplicable).map((mark) => mark.examSubjectId))
      // An elective paper counts only for the students who took it (have a mark);
      // a paper marked not applicable is left out of that student's result.
      const subjects = classSubjects.filter(
        (subject) =>
          classSubjectAppliesToSection(subject.classSubject.sections.map((row) => row.sectionId), sectionId) &&
          (!subject.classSubject.subject.isElective || marked.has(subject.id)) &&
          !notApplicable.has(subject.id),
      )
      const applicable = new Set(subjects.map((subject) => subject.id))
      const studentMarks = (marksByStudent.get(studentId) ?? []).filter((mark) => applicable.has(mark.examSubjectId))
      if (subjects.length === 0 || studentMarks.length !== subjects.length) {
        skipped++
        skippedIds.push(studentId)
        const have = new Set(studentMarks.map((mark) => mark.examSubjectId))
        for (const subject of subjects) {
          if (!have.has(subject.id)) {
            const label = `${examClass.classLevel.name} · ${subject.classSubject.subject.name}`
            waitingOn.set(label, (waitingOn.get(label) ?? 0) + 1)
          }
        }
        continue
      }
      const totalMax = subjects.reduce((sum, subject) => sum + subject.maxMarks, 0)
      const totalObtained = studentMarks.reduce((sum, mark) => sum + (mark.marksObtained ?? 0), 0)
      const percentage = totalMax === 0 ? 0 : Math.round((totalObtained / totalMax) * 10000) / 100
      const band = gradeForPercent(percentage, exam.gradingScale.bands)
      const isPass = resultPasses(
        exam.gradingScale,
        percentage,
        band,
        studentMarks.map((mark) => ({ ...mark, passMarks: subjectById.get(mark.examSubjectId)!.passMarks })),
      )
      const result = await ctx.db.result.upsert({
        where: { tenantId_examId_studentId: { tenantId: ctx.tenant.id, examId, studentId } },
        create: { tenantId: ctx.tenant.id, examId, studentId, totalMax, totalObtained, percentage, grade: band?.grade ?? null, isPass, rankInClass: null, publishedAt },
        update: { totalMax, totalObtained, percentage, grade: band?.grade ?? null, isPass, rankInClass: null, ...(publishedAt ? {} : { publishedAt: null }) },
      })
      resultIdsByClass.set(examClass.classLevelId, [...(resultIdsByClass.get(examClass.classLevelId) ?? []), result.id])
      calculated++
    }
    if (skippedIds.length > 0) {
      const stale = await ctx.db.result.deleteMany({ where: { examId, studentId: { in: skippedIds }, publishedAt: null } })
      removed += stale.count
    }
  }
  for (const ids of resultIdsByClass.values()) {
    const results = await ctx.db.result.findMany({
      where: { id: { in: ids } },
      select: { id: true, percentage: true, totalObtained: true },
    })
    for (const ranked of assignClassRanks(results)) {
      await ctx.db.result.update({ where: { id: ranked.id }, data: { rankInClass: ranked.rank } })
    }
  }
  const scope = options.classLevelId ? ` · ${classes[0]?.classLevel.name ?? ''}` : ''
  const waiting = [...waitingOn.entries()].sort((a, b) => b[1] - a[1]).map(([paper, students]) => ({ paper, students }))
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'exam.results.compute', module: 'results', entityType: 'Exam', entityId: examId, summary: `Computed ${calculated} results for ${exam.name}${scope}`, after: { calculated, skipped, removedStale: removed, classLevelId: options.classLevelId ?? null, waitingOn: waiting.slice(0, 10) } })
  return { calculated, skipped, waiting }
}

export async function publishResults(ctx: AppContext, examId: string) {
  ctx.require('exams.publish')
  const exam = await ctx.db.exam.findFirst({ where: { id: examId }, select: { id: true, name: true, status: true, _count: { select: { results: true } } } })
  if (!exam) throw notFound('Exam')
  if (exam.status === 'PUBLISHED') throw conflict('Results have already been published')
  if (exam._count.results === 0) throw conflict('Compute results before publishing')
  const publishedAt = new Date()
  await ctx.db.$transaction(async (tx) => {
    await tx.result.updateMany({ where: { examId }, data: { publishedAt } })
    await tx.examSubject.updateMany({
      where: { examId, marksStatus: { not: 'LOCKED' } },
      data: { marksStatus: 'LOCKED', marksLockedAt: publishedAt, marksLockedById: ctx.user.userId },
    })
    await tx.exam.update({ where: { id: examId }, data: { status: 'PUBLISHED', publishedAt } })
  })
  const recipients = await ctx.db.result.findMany({
    where: { examId },
    select: { student: { select: { userId: true, guardians: { select: { parent: { select: { userId: true } } } } } } },
  })
  await notify(ctx, { userIds: recipients.flatMap((result) => [result.student.userId, ...result.student.guardians.map((guardian) => guardian.parent.userId)].filter((id): id is string => Boolean(id))), eventKey: 'result.published', title: `${exam.name} results are available`, body: 'Your examination result has been published.', linkUrl: `/exams/results?exam=${examId}` })
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'exam.results.publish', module: 'results', entityType: 'Exam', entityId: examId, summary: `Published ${exam._count.results} results for ${exam.name}`, after: { publishedAt } })
  return { published: exam._count.results }
}

export async function listResults(ctx: AppContext, examId?: string) {
  ctx.require('results.view')
  const ids = await accessibleStudentIds(ctx)
  return ctx.db.result.findMany({
    where: { ...(examId ? { examId } : {}), ...(ids === null ? {} : { studentId: { in: ids }, publishedAt: { not: null } }) },
    orderBy: [{ exam: { createdAt: 'desc' } }, { rankInClass: 'asc' }],
    select: { id: true, totalMax: true, totalObtained: true, percentage: true, grade: true, rankInClass: true, isPass: true, publishedAt: true, exam: { select: { id: true, name: true, status: true } }, student: { select: { id: true, photoUrl: true, firstName: true, lastName: true, admissionNo: true, enrollments: { where: { isCurrent: true }, take: 1, select: { classLevel: { select: { name: true } } } } } } },
  })
}

/** Published result summaries. Kept separate from the staff results view so a
 * report card can never accidentally expose a draft to a parent or student. */
export async function listPublishedReportCards(ctx: AppContext, examId?: string) {
  ctx.require('results.view')
  const ids = await accessibleStudentIds(ctx)
  return ctx.db.result.findMany({
    where: { publishedAt: { not: null }, ...(examId ? { examId } : {}), ...(ids === null ? {} : { studentId: { in: ids } }) },
    orderBy: [{ exam: { createdAt: 'desc' } }, { rankInClass: 'asc' }],
    select: {
      id: true,
      percentage: true,
      grade: true,
      rankInClass: true,
      isPass: true,
      exam: { select: { id: true, name: true } },
      student: {
        select: {
          photoUrl: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: { classLevelId: true, sectionId: true, rollNumber: true, classLevel: { select: { name: true, numeric: true } }, section: { select: { name: true } } },
          },
        },
      },
    },
  })
}

type PublishedCard = Awaited<ReturnType<typeof listPublishedReportCards>>[number]

/** Class and section filters for published report cards, plus print order (class, section, roll). */
export function filterReportCards(cards: PublishedCard[], filters: { classLevelId?: string; sectionId?: string }) {
  const placement = (card: PublishedCard) => card.student.enrollments[0]
  const classes = new Map<string, { id: string; label: string; numeric: number }>()
  const sections = new Map<string, { id: string; label: string }>()
  for (const card of cards) {
    const row = placement(card)
    if (!row) continue
    classes.set(row.classLevelId, { id: row.classLevelId, label: row.classLevel.name, numeric: row.classLevel.numeric ?? 0 })
    if (row.classLevelId === filters.classLevelId) sections.set(row.sectionId, { id: row.sectionId, label: row.section.name })
  }
  const classLevelId = filters.classLevelId && classes.has(filters.classLevelId) ? filters.classLevelId : undefined
  const sectionId = classLevelId && filters.sectionId && sections.has(filters.sectionId) ? filters.sectionId : undefined
  const rows = cards
    .filter((card) => {
      const row = placement(card)
      return (!classLevelId || row?.classLevelId === classLevelId) && (!sectionId || row?.sectionId === sectionId)
    })
    .sort((a, b) => {
      const x = placement(a)
      const y = placement(b)
      return (
        (x?.classLevel.numeric ?? 0) - (y?.classLevel.numeric ?? 0) ||
        (x?.classLevel.name ?? '').localeCompare(y?.classLevel.name ?? '') ||
        (x?.section.name ?? '').localeCompare(y?.section.name ?? '') ||
        (x?.rollNumber ?? 9999) - (y?.rollNumber ?? 9999) ||
        a.student.firstName.localeCompare(b.student.firstName)
      )
    })
  return {
    rows,
    classLevelId,
    sectionId,
    classes: [...classes.values()].sort((a, b) => a.numeric - b.numeric || a.label.localeCompare(b.label)),
    sections: [...sections.values()].sort((a, b) => a.label.localeCompare(b.label)),
  }
}

/**
 * Report card document data. Parents and students only ever see published
 * results; administrators may preview a computed draft before publishing.
 */
export async function getReportCard(ctx: AppContext, resultId: string): Promise<ReportCardDocumentData & { resultId: string; examId: string }> {
  ctx.require('results.view')
  const ids = await accessibleStudentIds(ctx)
  const allowDraft = ids === null && ctx.can('exams.manage')
  const result = await ctx.db.result.findFirst({
    where: { id: resultId, ...(allowDraft ? {} : { publishedAt: { not: null } }), ...(ids === null ? {} : { studentId: { in: ids } }) },
    include: {
      exam: { include: { gradingScale: { include: { bands: true } }, session: { select: { name: true } } } },
      student: {
        include: {
          enrollments: { where: { isCurrent: true }, take: 1, include: { classLevel: true, section: true } },
          guardians: { select: { id: true, relation: true, isPrimary: true, parent: { select: { id: true, firstName: true, lastName: true } } } },
        },
      },
    },
  })
  if (!result) throw notFound('Report card')
  const enrollment = result.student.enrollments[0]
  const [marks, template, school, classStrength] = await Promise.all([
    ctx.db.mark.findMany({
      where: { studentId: result.studentId, notApplicable: false, examSubject: { examId: result.examId, closedWithoutMarks: false } },
      orderBy: { examSubject: { classSubject: { subject: { name: 'asc' } } } },
      select: { marksObtained: true, isAbsent: true, remarks: true, examSubject: { select: { maxMarks: true, passMarks: true, classSubject: { select: { subject: { select: { code: true, name: true } } } } } } },
    }),
    getDefaultReportCardTemplate(ctx),
    ctx.db.school.findFirst({ select: { addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true, phone: true, email: true, website: true } }),
    enrollment
      ? ctx.db.result.count({ where: { examId: result.examId, student: { enrollments: { some: { isCurrent: true, classLevelId: enrollment.classLevelId } } } } })
      : Promise.resolve(0),
  ])
  let attendance: ReportCardDocumentData['attendance'] = null
  if (template?.showAttendance) {
    const rows = await ctx.db.studentAttendance.groupBy({
      by: ['status'],
      where: { studentId: result.studentId, sessionId: result.exam.sessionId },
      _count: { _all: true },
    })
    const present = rows
      .filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
      .reduce((sum, r) => sum + r._count._all, 0)
    const total = rows.reduce((sum, r) => sum + r._count._all, 0)
    if (total > 0) attendance = { present, total, percent: Math.round((present / total) * 1000) / 10 }
  }
  const bands = result.exam.gradingScale?.bands ?? []
  const subjects = marks.map((mark) => {
    const percent = mark.marksObtained === null || mark.examSubject.maxMarks === 0 ? null : (mark.marksObtained / mark.examSubject.maxMarks) * 100
    const band = percent === null ? null : gradeForPercent(percent, bands)
    return {
      code: mark.examSubject.classSubject.subject.code,
      name: mark.examSubject.classSubject.subject.name,
      maxMarks: mark.examSubject.maxMarks,
      marksObtained: mark.marksObtained,
      isAbsent: mark.isAbsent,
      scaled: percent === null ? null : Math.round(percent * 10) / 10,
      grade: band?.grade ?? null,
      points: band?.points ?? null,
      remarks: mark.remarks || band?.remark || null,
      isPass: !mark.isAbsent && (mark.marksObtained ?? 0) >= mark.examSubject.passMarks,
    }
  })
  const parentNames = parentNamesFor(result.student.guardians)
  const guardian = (relation: 'FATHER' | 'MOTHER') =>
    (relation === 'FATHER' ? parentNames.fatherName : parentNames.motherName) || '—'
  const brand = ctx.tenant.school
  const address = school
    ? [school.addressLine1, school.addressLine2, school.city, school.state, school.postalCode].filter(Boolean).join(', ')
    : ''
  const contact = school ? [school.phone, school.email, school.website].filter(Boolean).join(' · ') : ''
  return {
    resultId: result.id,
    examId: result.examId,
    school: {
      name: brand?.name ?? ctx.tenant.name,
      code: brand?.code ?? '',
      logoUrl: brand?.logoUrl ?? null,
      address,
      contact,
      signatureUrl: brand?.signatureUrl ?? null,
    },
    sessionName: result.exam.session?.name ?? '',
    examName: result.exam.name,
    issuedOn: (result.publishedAt ?? new Date()).toISOString().slice(0, 10),
    draft: !result.publishedAt,
    student: {
      name: `${result.student.firstName} ${result.student.lastName}`.trim(),
      admissionNo: result.student.admissionNo,
      fatherName: guardian('FATHER'),
      motherName: guardian('MOTHER'),
      dateOfBirth: result.student.dateOfBirth ? result.student.dateOfBirth.toISOString().slice(0, 10) : '',
      className: enrollment?.classLevel.name ?? '—',
      sectionName: enrollment?.section.name ?? '—',
      rollNumber: enrollment?.rollNumber != null ? String(enrollment.rollNumber) : '—',
      bloodGroup: result.student.bloodGroup ?? '—',
      photoUrl: result.student.photoUrl,
    },
    attendance,
    subjects,
    totals: {
      obtained: result.totalObtained,
      max: result.totalMax,
      percentage: result.percentage,
      grade: result.grade,
      cgpa: computeCgpa(subjects),
      rank: result.rankInClass,
      classStrength,
      isPass: result.isPass,
    },
    holistic: parseHolistic(result.holistic),
    teacherRemark: result.teacherRemark,
    principalRemark: result.principalRemark,
    promotionStatus: result.promotionStatus,
    options: {
      showAttendance: template?.showAttendance ?? true,
      showRank: template?.showRank ?? true,
      showRemarks: template?.showRemarks ?? true,
    },
    config: parseReportCardConfig(template?.config),
  }
}

export async function exportResultsCsv(ctx: AppContext, examId: string) {
  ctx.require('results.export')
  const results = await listResults(ctx, examId)
  const header = [
    'Admission No',
    'Student',
    'Class',
    'Total Obtained',
    'Total Max',
    'Percentage',
    'Grade',
    'Rank',
    'Pass',
    'Published',
  ]
  const lines = results.map((r) =>
    [
      r.student.admissionNo,
      `${r.student.firstName} ${r.student.lastName}`,
      r.student.enrollments[0]?.classLevel.name ?? '',
      r.totalObtained,
      r.totalMax,
      r.percentage,
      r.grade ?? '',
      r.rankInClass ?? '',
      r.isPass ? 'Yes' : 'No',
      r.publishedAt ? 'Yes' : 'No',
    ]
      .map((cell) => {
        const value = String(cell)
        return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
      })
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

export async function deleteExam(ctx: AppContext, examId: string) {
  ctx.require('exams.delete')

  const exam = await ctx.db.exam.findFirst({
    where: { id: examId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, status: true },
  })
  if (!exam) throw notFound('Exam')

  if (exam.status === 'PUBLISHED') {
    throw conflict(
      'Published exams cannot be deleted. Archive the exam first, then delete it from the archived list.',
    )
  }

  await ctx.db.exam.delete({ where: { id: examId } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'exam.delete',
    module: 'exams',
    entityType: 'Exam',
    entityId: examId,
    summary: `Deleted exam ${exam.name}`,
    before: exam,
  })

  return { deleted: true }
}
