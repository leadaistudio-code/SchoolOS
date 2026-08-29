import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'
import { currentSession } from '@/server/modules/academics/service'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'
import { accessibleStudentIds } from '@/server/scope'
import { notify } from '@/server/notifications'
import { getDefaultReportCardTemplate } from './report-templates'

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
        marksObtained: z.coerce.number().min(0).max(1000).nullable(),
        isAbsent: z.coerce.boolean().default(false),
        remarks: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .min(1),
})

export const gradingScaleSchema = z.object({
  name: z.string().trim().min(2, 'Enter a scale name').max(60),
  isDefault: z.coerce.boolean().default(false),
  bands: z.array(z.object({
    grade: z.string().trim().min(1).max(12),
    minPercent: z.coerce.number().min(0).max(100),
    maxPercent: z.coerce.number().min(0).max(100),
    points: z.coerce.number().min(0).max(10).nullable().optional(),
    remark: z.string().trim().max(120).nullable().optional(),
    isPass: z.coerce.boolean().default(true),
  })).min(1, 'Add at least one grade band'),
}).superRefine((value, context) => {
  const sorted = [...value.bands].sort((a, b) => a.minPercent - b.minPercent)
  for (const [index, band] of sorted.entries()) {
    if (band.minPercent > band.maxPercent) context.addIssue({ code: 'custom', path: ['bands', index, 'maxPercent'], message: 'Maximum must be at least the minimum' })
    if (index > 0 && band.minPercent <= sorted[index - 1]!.maxPercent) context.addIssue({ code: 'custom', path: ['bands', index], message: 'Grade bands cannot overlap' })
  }
})

export type GradeBandValue = { grade: string; minPercent: number; maxPercent: number; isPass: boolean }
export function gradeForPercent(percent: number, bands: GradeBandValue[]) {
  return bands.find((band) => percent >= band.minPercent && percent <= band.maxPercent) ?? null
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

export const examPaperUpdateSchema = z.object({
  papers: z
    .array(
      z.object({
        id: z.string().min(1),
        maxMarks: z.coerce.number().positive().max(1000),
        passMarks: z.coerce.number().min(0).max(1000),
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
  }
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
        select: { id: true, subject: { select: { name: true, code: true } } },
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
  return ctx.db.gradingScale.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], include: { bands: { orderBy: { minPercent: 'desc' } } } })
}

export async function createGradingScale(ctx: AppContext, input: z.infer<typeof gradingScaleSchema>) {
  ctx.require('exams.manage')
  const existing = await ctx.db.gradingScale.findFirst({ where: { name: input.name } })
  if (existing) throw conflict(`A grading scale named ${input.name} already exists`)
  const scale = await ctx.db.$transaction(async (tx) => {
    if (input.isDefault) await tx.gradingScale.updateMany({ data: { isDefault: false } })
    return tx.gradingScale.create({ data: {
      tenantId: ctx.tenant.id, name: input.name, isDefault: input.isDefault,
      bands: { create: input.bands.map((band) => ({ tenantId: ctx.tenant.id, ...band })) },
    }, include: { bands: true } })
  })
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'grading_scale.create', module: 'exams', entityType: 'GradingScale', entityId: scale.id, summary: `Created grading scale ${scale.name}`, after: scale })
  return scale
}

export async function listExams(ctx: AppContext, query: ListQuery) {
  ctx.require('exams.view')
  const where: Prisma.ExamWhereInput = { ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}) }
  const [rows, total] = await Promise.all([
    ctx.db.exam.findMany({
      where, orderBy: orderByFrom(query.sort, query.dir, EXAM_SORT_FIELDS, { createdAt: 'desc' }), ...skipTake(query),
      select: { id: true, name: true, kind: true, status: true, startsOn: true, endsOn: true, gradingScaleId: true, gradingScale: { select: { name: true } }, _count: { select: { classes: true, subjects: true } } },
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
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId },
    include: {
      gradingScale: { select: { id: true, name: true } },
      classes: {
        include: { classLevel: { select: { id: true, name: true } } },
        orderBy: { classLevel: { numeric: 'asc' } },
      },
      subjects: {
        orderBy: [
          { classSubject: { classLevel: { numeric: 'asc' } } },
          { classSubject: { subject: { name: 'asc' } } },
        ],
        include: {
          classSubject: {
            select: {
              classLevel: { select: { name: true } },
              subject: { select: { name: true, code: true } },
            },
          },
        },
      },
      _count: { select: { results: true } },
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
    select: { id: true, name: true, status: true, subjects: { select: { id: true } } },
  })
  if (!exam) throw notFound('Exam')
  if (exam.status === 'PUBLISHED') throw conflict('Papers cannot be changed after publishing')

  const allowed = new Set(exam.subjects.map((s) => s.id))
  if (input.papers.some((p) => !allowed.has(p.id))) {
    throw conflict('One or more papers do not belong to this exam')
  }

  await ctx.db.$transaction(async (tx) => {
    for (const paper of input.papers) {
      await tx.examSubject.update({
        where: { id: paper.id },
        data: {
          maxMarks: paper.maxMarks,
          passMarks: paper.passMarks,
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

export async function examMarksSetup(ctx: AppContext, examId: string) {
  ctx.require('exams.marks')
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId },
    select: {
      id: true, name: true,
      subjects: {
        orderBy: { classSubject: { subject: { name: 'asc' } } },
        select: { id: true, maxMarks: true, classSubject: { select: { classLevel: { select: { name: true } }, subject: { select: { name: true } }, teacherId: true } } },
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
    select: { id: true, maxMarks: true, passMarks: true, exam: { select: { id: true, name: true, sessionId: true } }, classSubject: { select: { classLevelId: true, subject: { select: { name: true } }, teacherId: true } } },
  })
  if (!subject) throw notFound('Exam subject')
  if (!ctx.can('exams.manage')) {
    const staff = await ctx.db.staff.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } })
    if (!staff || subject.classSubject.teacherId !== staff.id) throw notFound('Exam subject')
  }
  const students = await ctx.db.enrollment.findMany({
    where: { sessionId: subject.exam.sessionId, classLevelId: subject.classSubject.classLevelId, isCurrent: true, student: { deletedAt: null } },
    orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
    select: { studentId: true, rollNumber: true, student: { select: { admissionNo: true, firstName: true, lastName: true } } },
  })
  const marks = await ctx.db.mark.findMany({ where: { examSubjectId }, select: { studentId: true, marksObtained: true, isAbsent: true, remarks: true } })
  const byStudent = new Map(marks.map((mark) => [mark.studentId, mark]))
  return {
    exam: subject.exam, subject: subject.classSubject.subject, maxMarks: subject.maxMarks, passMarks: subject.passMarks,
    rows: students.map((enrollment) => ({ ...enrollment, mark: byStudent.get(enrollment.studentId) ?? null })),
  }
}

export async function saveMarks(ctx: AppContext, examId: string, examSubjectId: string, input: z.infer<typeof marksSaveSchema>) {
  const roster = await marksRoster(ctx, examId, examSubjectId)
  const allowed = new Set(roster.rows.map((row) => row.studentId))
  const unique = new Set(input.rows.map((row) => row.studentId))
  if (unique.size !== input.rows.length || input.rows.some((row) => !allowed.has(row.studentId))) throw conflict('Marks can only be entered for students in this class')
  if (input.rows.some((row) => !row.isAbsent && (row.marksObtained === null || row.marksObtained > roster.maxMarks))) {
    throw conflict(`Enter a mark from 0 to ${roster.maxMarks}, or mark the student absent`)
  }
  await ctx.db.$transaction(async (tx) => {
    for (const row of input.rows) {
      const percent = row.marksObtained === null ? null : (row.marksObtained / roster.maxMarks) * 100
      await tx.mark.upsert({
        where: { tenantId_examSubjectId_studentId: { tenantId: ctx.tenant.id, examSubjectId, studentId: row.studentId } },
        create: { tenantId: ctx.tenant.id, examSubjectId, studentId: row.studentId, marksObtained: row.isAbsent ? null : row.marksObtained, isAbsent: row.isAbsent, remarks: row.remarks ?? null, enteredById: ctx.user.userId, grade: percent === null ? null : undefined },
        update: { marksObtained: row.isAbsent ? null : row.marksObtained, isAbsent: row.isAbsent, remarks: row.remarks ?? null, enteredById: ctx.user.userId },
      })
    }
    await tx.exam.updateMany({
      where: { id: examId, status: { in: ['DRAFT', 'SCHEDULED', 'ONGOING'] } },
      data: { status: 'MARKS_ENTRY' },
    })
  })
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'exam.marks.save', module: 'exams', entityType: 'ExamSubject', entityId: examSubjectId, summary: `Saved marks for ${roster.subject.name} in ${roster.exam.name}`, after: { students: input.rows.length } })
  return { saved: input.rows.length }
}

export async function computeResults(ctx: AppContext, examId: string) {
  ctx.require('exams.manage')
  const exam = await ctx.db.exam.findFirst({
    where: { id: examId },
    include: {
      gradingScale: { include: { bands: true } },
      classes: { select: { classLevelId: true } },
      subjects: { select: { id: true, maxMarks: true, passMarks: true, classSubject: { select: { classLevelId: true } } } },
    },
  })
  if (!exam) throw notFound('Exam')
  if (exam.status === 'PUBLISHED') throw conflict('Published results cannot be recalculated')
  if (!exam.gradingScale) throw conflict('Choose a grading scale before computing results')

  let calculated = 0
  let skipped = 0
  const resultIdsByClass = new Map<string, string[]>()
  for (const examClass of exam.classes) {
    const subjects = exam.subjects.filter((subject) => subject.classSubject.classLevelId === examClass.classLevelId)
    if (subjects.length === 0) continue
    const enrollments = await ctx.db.enrollment.findMany({
      where: { sessionId: exam.sessionId, classLevelId: examClass.classLevelId, isCurrent: true, student: { deletedAt: null } },
      select: { studentId: true },
    })
    const studentIds = enrollments.map((row) => row.studentId)
    const marks = await ctx.db.mark.findMany({
      where: { examSubjectId: { in: subjects.map((subject) => subject.id) }, studentId: { in: studentIds } },
      select: { studentId: true, examSubjectId: true, marksObtained: true, isAbsent: true },
    })
    const marksByStudent = new Map<string, typeof marks>()
    for (const mark of marks) marksByStudent.set(mark.studentId, [...(marksByStudent.get(mark.studentId) ?? []), mark])
    const subjectById = new Map(subjects.map((subject) => [subject.id, subject]))
    for (const studentId of studentIds) {
      const studentMarks = marksByStudent.get(studentId) ?? []
      if (studentMarks.length !== subjects.length) { skipped++; continue }
      const totalMax = subjects.reduce((sum, subject) => sum + subject.maxMarks, 0)
      const totalObtained = studentMarks.reduce((sum, mark) => sum + (mark.marksObtained ?? 0), 0)
      const percentage = totalMax === 0 ? 0 : Math.round((totalObtained / totalMax) * 10000) / 100
      const band = gradeForPercent(percentage, exam.gradingScale.bands)
      const isPass = band?.isPass === true && studentMarks.every((mark) => {
        const subject = subjectById.get(mark.examSubjectId)!
        return !mark.isAbsent && (mark.marksObtained ?? 0) >= subject.passMarks
      })
      const result = await ctx.db.result.upsert({
        where: { tenantId_examId_studentId: { tenantId: ctx.tenant.id, examId, studentId } },
        create: { tenantId: ctx.tenant.id, examId, studentId, totalMax, totalObtained, percentage, grade: band?.grade ?? null, isPass, rankInClass: null },
        update: { totalMax, totalObtained, percentage, grade: band?.grade ?? null, isPass, rankInClass: null, publishedAt: null },
      })
      resultIdsByClass.set(examClass.classLevelId, [...(resultIdsByClass.get(examClass.classLevelId) ?? []), result.id])
      calculated++
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
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action: 'exam.results.compute', module: 'results', entityType: 'Exam', entityId: examId, summary: `Computed ${calculated} results for ${exam.name}`, after: { calculated, skipped } })
  return { calculated, skipped }
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
    select: { id: true, percentage: true, grade: true, rankInClass: true, isPass: true, exam: { select: { id: true, name: true } }, student: { select: { photoUrl: true, firstName: true, lastName: true, admissionNo: true } } },
  })
}

export async function getReportCard(ctx: AppContext, resultId: string) {
  ctx.require('results.view')
  const ids = await accessibleStudentIds(ctx)
  const result = await ctx.db.result.findFirst({
    where: { id: resultId, publishedAt: { not: null }, ...(ids === null ? {} : { studentId: { in: ids } }) },
    include: {
      exam: { include: { gradingScale: { include: { bands: true } } } },
      student: { include: { enrollments: { where: { isCurrent: true }, take: 1, include: { classLevel: true, section: true } } } },
    },
  })
  if (!result) throw notFound('Report card')
  const marks = await ctx.db.mark.findMany({
    where: { studentId: result.studentId, examSubject: { examId: result.examId } },
    orderBy: { examSubject: { classSubject: { subject: { name: 'asc' } } } },
    select: { marksObtained: true, isAbsent: true, remarks: true, examSubject: { select: { maxMarks: true, passMarks: true, classSubject: { select: { subject: { select: { code: true, name: true } } } } } } },
  })
  const template = await getDefaultReportCardTemplate(ctx)
  let attendance: { present: number; absent: number; total: number; percent: number } | null = null
  if (template?.showAttendance) {
    const rows = await ctx.db.studentAttendance.groupBy({
      by: ['status'],
      where: { studentId: result.studentId, sessionId: result.exam.sessionId },
      _count: { _all: true },
    })
    const present = rows
      .filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
      .reduce((sum, r) => sum + r._count._all, 0)
    const absent = rows
      .filter((r) => r.status === 'ABSENT')
      .reduce((sum, r) => sum + r._count._all, 0)
    const total = rows.reduce((sum, r) => sum + r._count._all, 0)
    attendance = {
      present,
      absent,
      total,
      percent: total === 0 ? 0 : Math.round((present / total) * 1000) / 10,
    }
  }
  return {
    result,
    template,
    attendance,
    className: result.student.enrollments[0]?.classLevel.name ?? '—',
    sectionName: result.student.enrollments[0]?.section.name ?? '—',
    subjects: marks.map((mark) => {
      const percent = mark.marksObtained === null ? null : (mark.marksObtained / mark.examSubject.maxMarks) * 100
      const band = percent === null || !result.exam.gradingScale ? null : gradeForPercent(percent, result.exam.gradingScale.bands)
      return { code: mark.examSubject.classSubject.subject.code, name: mark.examSubject.classSubject.subject.name, maxMarks: mark.examSubject.maxMarks, passMarks: mark.examSubject.passMarks, marksObtained: mark.marksObtained, isAbsent: mark.isAbsent, remarks: mark.remarks, grade: band?.grade ?? null, isPass: !mark.isAbsent && (mark.marksObtained ?? 0) >= mark.examSubject.passMarks }
    }),
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
