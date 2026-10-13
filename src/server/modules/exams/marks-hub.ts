import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { schoolToday } from '@/lib/periods'
import { classSubjectAppliesToSection } from './section-subjects'

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional()).catch(undefined)

export const MARKS_HUB_TABS = ['overview', 'register', 'sheets', 'missing', 'teachers', 'exceptions', 'imports', 'audit'] as const
export type MarksHubTab = (typeof MARKS_HUB_TABS)[number]

export const MARK_SOURCES = [
  { value: 'TEACHER_MANUAL', label: 'Teacher manual' },
  { value: 'ADMIN_MANUAL', label: 'School admin manual' },
  { value: 'CSV_IMPORT', label: 'CSV import' },
] as const

export const SHEET_STATUSES = [
  { value: 'COMPLETE', label: 'Completed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'OPEN', label: 'Open (not submitted)' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'LOCKED', label: 'Locked' },
] as const

export const marksHubFilterSchema = z.object({
  tab: optional(z.enum(MARKS_HUB_TABS)),
  exam: optional(z.string().max(40)),
  classLevelId: optional(z.string().max(40)),
  sectionId: optional(z.string().max(40)),
  status: optional(z.enum(['COMPLETE', 'PENDING', 'OPEN', 'SUBMITTED', 'LOCKED'])),
  source: optional(z.enum(['TEACHER_MANUAL', 'ADMIN_MANUAL', 'CSV_IMPORT'])),
  q: optional(z.string().trim().max(80)),
})
export type MarksHubFilters = z.infer<typeof marksHubFilterSchema>

export type ExceptionKind = 'OVERDUE' | 'SUBMITTED_INCOMPLETE' | 'OVER_MAX' | 'ZERO_SCORE' | 'NO_TEACHER'

export const EXCEPTION_LABELS: Record<ExceptionKind, { label: string; hint: string; severity: 'high' | 'medium' | 'low' }> = {
  OVERDUE: { label: 'Marks overdue', hint: 'Paper date has passed but marks are incomplete', severity: 'high' },
  SUBMITTED_INCOMPLETE: { label: 'Submitted with gaps', hint: 'Sheet was submitted or locked with students missing', severity: 'high' },
  OVER_MAX: { label: 'Above maximum', hint: 'Mark exceeds the paper maximum (maximum changed after entry)', severity: 'high' },
  ZERO_SCORE: { label: 'Zero score', hint: 'Recorded as 0 rather than absent — confirm it is intentional', severity: 'low' },
  NO_TEACHER: { label: 'No subject teacher', hint: 'Nobody is assigned to enter marks for this paper', severity: 'medium' },
}

/** Completion percentage, rounded down so 99.6% never reads as finished. */
export function completionPercent(entered: number, expected: number) {
  if (expected <= 0) return 0
  return Math.floor((entered / expected) * 100)
}

/**
 * Marks monitoring across every open examination: sheet completion, missing
 * marks, teacher submissions, entry sources and data exceptions. Teachers only
 * see the papers they teach.
 */
export async function marksHub(ctx: AppContext, filters: MarksHubFilters) {
  ctx.require('exams.marks')
  const isAdmin = ctx.can('exams.manage')
  const staff = isAdmin
    ? null
    : await ctx.db.staff.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } })

  const exams = await ctx.db.exam.findMany({
    where: { status: { not: 'ARCHIVED' } },
    orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, name: true, status: true, sessionId: true },
  })
  const scopedExams = filters.exam ? exams.filter((exam) => exam.id === filters.exam) : exams
  const examById = new Map(exams.map((exam) => [exam.id, exam]))

  const sheetRows = await ctx.db.examSubject.findMany({
    where: {
      examId: { in: scopedExams.map((exam) => exam.id) },
      ...(filters.classLevelId ? { classSubject: { classLevelId: filters.classLevelId } } : {}),
      ...(isAdmin ? {} : { classSubject: { teacherId: staff?.id ?? '__none__', ...(filters.classLevelId ? { classLevelId: filters.classLevelId } : {}) } }),
    },
    orderBy: [{ classSubject: { classLevel: { numeric: 'asc' } } }, { classSubject: { subject: { name: 'asc' } } }],
    select: {
      id: true,
      examId: true,
      maxMarks: true,
      passMarks: true,
      examDate: true,
      marksStatus: true,
      marksSubmittedAt: true,
      marksLockedAt: true,
      closedWithoutMarks: true,
      closedReason: true,
      classSubject: {
        select: {
          classLevelId: true,
          classLevel: { select: { name: true, numeric: true } },
          subject: { select: { name: true, code: true, isElective: true } },
          teacher: { select: { id: true, firstName: true, lastName: true } },
          sections: { select: { sectionId: true } },
        },
      },
    },
  })

  const pairs = new Map<string, { sessionId: string; classLevelId: string }>()
  for (const sheet of sheetRows) {
    const exam = examById.get(sheet.examId)!
    pairs.set(`${exam.sessionId}:${sheet.classSubject.classLevelId}`, { sessionId: exam.sessionId, classLevelId: sheet.classSubject.classLevelId })
  }
  const enrollments = pairs.size
    ? await ctx.db.enrollment.findMany({
        where: {
          isCurrent: true,
          student: { deletedAt: null },
          OR: [...pairs.values()].map((pair) => ({ sessionId: pair.sessionId, classLevelId: pair.classLevelId })),
          ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
        },
        orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
        select: {
          studentId: true,
          sessionId: true,
          classLevelId: true,
          sectionId: true,
          rollNumber: true,
          section: { select: { name: true } },
          student: { select: { firstName: true, lastName: true, admissionNo: true } },
        },
      })
    : []
  const rosterByPair = new Map<string, typeof enrollments>()
  for (const row of enrollments) {
    const key = `${row.sessionId}:${row.classLevelId}`
    rosterByPair.set(key, [...(rosterByPair.get(key) ?? []), row])
  }

  const marks = sheetRows.length
    ? await ctx.db.mark.findMany({
        where: { examSubjectId: { in: sheetRows.map((sheet) => sheet.id) } },
        select: { examSubjectId: true, studentId: true, marksObtained: true, isAbsent: true, source: true, updatedAt: true },
      })
    : []
  const marksBySheet = new Map<string, Map<string, (typeof marks)[number]>>()
  for (const mark of marks) {
    const bucket = marksBySheet.get(mark.examSubjectId) ?? new Map()
    bucket.set(mark.studentId, mark)
    marksBySheet.set(mark.examSubjectId, bucket)
  }

  const today = schoolToday()
  const q = filters.q?.toLowerCase()
  const sourceCounts = { TEACHER_MANUAL: 0, ADMIN_MANUAL: 0, CSV_IMPORT: 0 }
  const missing: Array<{
    key: string; examName: string; examId: string; sheetId: string; className: string; sectionName: string
    subjectName: string; teacherName: string; studentName: string; admissionNo: string; rollNumber: number | null
  }> = []
  const exceptions: Array<{
    key: string; kind: ExceptionKind; examName: string; examId: string; sheetId: string; className: string
    subjectName: string; detail: string
  }> = []
  const classProgress = new Map<string, { key: string; className: string; sectionName: string; numeric: number; students: Set<string>; subjects: Set<string>; expected: number; entered: number }>()
  const resultGroups = new Map<string, { key: string; examId: string; examName: string; examStatus: string; classLevelId: string; className: string; numeric: number; sheets: number; complete: number; closed: number; unlocked: number; pending: string[] }>()

  const sheets = sheetRows.flatMap((sheet) => {
    const exam = examById.get(sheet.examId)!
    const mapped = sheet.classSubject.sections.map((row) => row.sectionId)
    const sheetMarks = marksBySheet.get(sheet.id) ?? new Map()
    const elective = sheet.classSubject.subject.isElective
    const roster = (rosterByPair.get(`${exam.sessionId}:${sheet.classSubject.classLevelId}`) ?? []).filter(
      (row) => classSubjectAppliesToSection(mapped, row.sectionId) && (!elective || sheetMarks.has(row.studentId)),
    )
    const teacherName = sheet.classSubject.teacher
      ? `${sheet.classSubject.teacher.firstName} ${sheet.classSubject.teacher.lastName}`.trim()
      : ''
    const label = `${exam.name} ${sheet.classSubject.classLevel.name} ${sheet.classSubject.subject.name} ${teacherName}`.toLowerCase()

    let entered = 0
    let lastActivity: Date | null = null
    const sources = new Set<string>()
    const sheetMissing: typeof missing = []
    const closed = sheet.closedWithoutMarks
    for (const row of roster) {
      const mark = sheetMarks.get(row.studentId)
      if (closed) {
        if (mark) {
          entered++
          if (!lastActivity || mark.updatedAt > lastActivity) lastActivity = mark.updatedAt
        }
        continue
      }
      const progressKey = `${sheet.classSubject.classLevelId}:${row.sectionId ?? ''}`
      const progress = classProgress.get(progressKey) ?? {
        key: progressKey,
        className: sheet.classSubject.classLevel.name,
        sectionName: row.section?.name ?? '',
        numeric: sheet.classSubject.classLevel.numeric ?? 0,
        students: new Set<string>(),
        subjects: new Set<string>(),
        expected: 0,
        entered: 0,
      }
      progress.students.add(row.studentId)
      progress.subjects.add(sheet.classSubject.subject.name)
      progress.expected++
      if (mark) {
        entered++
        progress.entered++
        sources.add(mark.source)
        if (!lastActivity || mark.updatedAt > lastActivity) lastActivity = mark.updatedAt
      } else {
        sheetMissing.push({
          key: `${sheet.id}:${row.studentId}`,
          examName: exam.name,
          examId: exam.id,
          sheetId: sheet.id,
          className: sheet.classSubject.classLevel.name,
          sectionName: row.section?.name ?? '',
          subjectName: sheet.classSubject.subject.name,
          teacherName,
          studentName: `${row.student.firstName} ${row.student.lastName}`.trim(),
          admissionNo: row.student.admissionNo,
          rollNumber: row.rollNumber,
        })
      }
      classProgress.set(progressKey, progress)
    }

    const expected = roster.length
    const complete = expected > 0 && entered === expected
    const done = complete || closed

    const groupKey = `${exam.id}:${sheet.classSubject.classLevelId}`
    const group = resultGroups.get(groupKey) ?? {
      key: groupKey,
      examId: exam.id,
      examName: exam.name,
      examStatus: exam.status,
      classLevelId: sheet.classSubject.classLevelId,
      className: sheet.classSubject.classLevel.name,
      numeric: sheet.classSubject.classLevel.numeric ?? 0,
      sheets: 0,
      complete: 0,
      closed: 0,
      unlocked: 0,
      pending: [] as string[],
    }
    group.sheets++
    if (sheet.marksStatus !== 'LOCKED') group.unlocked++
    if (closed) group.closed++
    else if (complete) group.complete++
    else group.pending.push(sheet.classSubject.subject.name)
    resultGroups.set(groupKey, group)

    if (filters.status === 'COMPLETE' && !done) return []
    if (filters.status === 'PENDING' && done) return []
    if ((filters.status === 'OPEN' || filters.status === 'SUBMITTED' || filters.status === 'LOCKED') && sheet.marksStatus !== filters.status) return []
    if (filters.source && !sources.has(filters.source)) return []
    if (q && !label.includes(q) && !sheetMissing.some((row) => row.studentName.toLowerCase().includes(q) || row.admissionNo.toLowerCase().includes(q))) return []

    for (const mark of sheetMarks.values()) {
      if (roster.some((row) => row.studentId === mark.studentId)) sourceCounts[mark.source as keyof typeof sourceCounts]++
    }
    missing.push(...sheetMissing)

    const summary = {
      id: sheet.id,
      examId: exam.id,
      examName: exam.name,
      examStatus: exam.status,
      className: sheet.classSubject.classLevel.name,
      classLevelId: sheet.classSubject.classLevelId,
      subjectName: sheet.classSubject.subject.name,
      subjectCode: sheet.classSubject.subject.code,
      teacherId: sheet.classSubject.teacher?.id ?? null,
      teacherName,
      maxMarks: sheet.maxMarks,
      examDate: sheet.examDate,
      status: sheet.marksStatus,
      submittedAt: sheet.marksSubmittedAt,
      lockedAt: sheet.marksLockedAt,
      expected,
      entered,
      missing: closed ? 0 : expected - entered,
      percent: completionPercent(entered, expected),
      complete: done,
      closed,
      closedReason: sheet.closedReason,
      lastActivity,
    }
    if (closed) return [summary]

    const base = { examName: exam.name, examId: exam.id, sheetId: sheet.id, className: sheet.classSubject.classLevel.name, subjectName: sheet.classSubject.subject.name }
    const examDate = sheet.examDate ? sheet.examDate.toISOString().slice(0, 10) : null
    if (!complete && expected > 0 && examDate && examDate < today && sheet.marksStatus === 'OPEN') {
      exceptions.push({ ...base, key: `${sheet.id}:overdue`, kind: 'OVERDUE', detail: `${expected - entered} of ${expected} students missing since ${examDate}` })
    }
    if (!complete && expected > 0 && sheet.marksStatus !== 'OPEN') {
      exceptions.push({ ...base, key: `${sheet.id}:gaps`, kind: 'SUBMITTED_INCOMPLETE', detail: `${sheet.marksStatus.toLowerCase()} with ${expected - entered} students missing` })
    }
    if (!sheet.classSubject.teacher) {
      exceptions.push({ ...base, key: `${sheet.id}:teacher`, kind: 'NO_TEACHER', detail: 'Assign a subject teacher in Academics' })
    }
    for (const row of roster) {
      const mark = sheetMarks.get(row.studentId)
      if (!mark || mark.isAbsent || mark.marksObtained === null) continue
      const name = `${row.student.firstName} ${row.student.lastName}`.trim()
      if (mark.marksObtained > sheet.maxMarks) {
        exceptions.push({ ...base, key: `${sheet.id}:${row.studentId}:max`, kind: 'OVER_MAX', detail: `${name} (${row.student.admissionNo}) has ${mark.marksObtained} / ${sheet.maxMarks}` })
      } else if (mark.marksObtained === 0) {
        exceptions.push({ ...base, key: `${sheet.id}:${row.studentId}:zero`, kind: 'ZERO_SCORE', detail: `${name} (${row.student.admissionNo}) scored 0` })
      }
    }

    return [summary]
  })

  const teachers = new Map<string, { key: string; name: string; sheets: number; complete: number; submitted: number; locked: number; missing: number; lastActivity: Date | null }>()
  for (const sheet of sheets) {
    const key = sheet.teacherId ?? 'unassigned'
    const row = teachers.get(key) ?? { key, name: sheet.teacherName || 'Unassigned', sheets: 0, complete: 0, submitted: 0, locked: 0, missing: 0, lastActivity: null }
    row.sheets++
    if (sheet.complete) row.complete++
    if (sheet.status === 'SUBMITTED') row.submitted++
    if (sheet.status === 'LOCKED') row.locked++
    row.missing += sheet.missing
    if (sheet.lastActivity && (!row.lastActivity || sheet.lastActivity > row.lastActivity)) row.lastActivity = sheet.lastActivity
    teachers.set(key, row)
  }

  const resultRows = isAdmin && resultGroups.size
    ? await ctx.db.result.findMany({
        where: { examId: { in: [...new Set([...resultGroups.values()].map((g) => g.examId))] } },
        select: { examId: true, student: { select: { enrollments: { where: { isCurrent: true }, take: 1, select: { classLevelId: true } } } } },
      })
    : []
  const resultCounts = new Map<string, number>()
  for (const row of resultRows) {
    const classLevelId = row.student.enrollments[0]?.classLevelId
    if (!classLevelId) continue
    const key = `${row.examId}:${classLevelId}`
    resultCounts.set(key, (resultCounts.get(key) ?? 0) + 1)
  }

  const [classOptions, sectionOptions] = await Promise.all([
    ctx.db.classLevel.findMany({ orderBy: { numeric: 'asc' }, select: { id: true, name: true } }),
    ctx.db.section.findMany({
      where: { deletedAt: null, ...(filters.classLevelId ? { classLevelId: filters.classLevelId } : {}) },
      orderBy: [{ classLevel: { numeric: 'asc' } }, { name: 'asc' }],
      select: { id: true, name: true, classLevel: { select: { name: true } } },
    }),
  ])

  return {
    isAdmin,
    exams: scopedExams,
    examOptions: exams,
    classOptions,
    sectionOptions: sectionOptions.map((s) => ({ id: s.id, label: `${s.classLevel.name} · ${s.name}` })),
    sheets,
    missing,
    exceptions,
    teachers: [...teachers.values()].sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name)),
    classProgress: [...classProgress.values()]
      .map((row) => ({
        key: row.key,
        label: row.sectionName ? `${row.className} · ${row.sectionName}` : row.className,
        numeric: row.numeric,
        students: row.students.size,
        subjects: row.subjects.size,
        expected: row.expected,
        entered: row.entered,
        percent: completionPercent(row.entered, row.expected),
      }))
      .sort((a, b) => a.numeric - b.numeric || a.label.localeCompare(b.label)),
    sources: sourceCounts,
    resultReadiness: isAdmin
      ? [...resultGroups.values()]
          .filter((group) => group.examStatus !== 'PUBLISHED' || group.unlocked > 0 || group.pending.length > 0)
          .map((group) => ({ ...group, ready: group.pending.length === 0 && group.complete > 0, results: resultCounts.get(group.key) ?? 0 }))
          .sort((a, b) => a.examName.localeCompare(b.examName) || a.numeric - b.numeric || a.className.localeCompare(b.className))
      : [],
    stats: {
      exams: scopedExams.length,
      sheets: sheets.length,
      completed: sheets.filter((s) => s.complete).length,
      pending: sheets.filter((s) => !s.complete).length,
      submitted: sheets.filter((s) => s.status === 'SUBMITTED').length,
      locked: sheets.filter((s) => s.status === 'LOCKED').length,
      missing: missing.length,
      exceptions: exceptions.length,
    },
  }
}

/** Marks-related audit events: imports for the CSV tab, everything for the trail. */
export async function marksActivity(ctx: AppContext, kind: 'imports' | 'audit', examId?: string) {
  ctx.require('exams.marks')
  const actions = kind === 'imports'
    ? ['exam.marks.import']
    : ['exam.marks.save', 'exam.marks.import', 'exam.marks.submit', 'exam.marks.lock', 'exam.marks.reopen', 'exam.marks.close', 'exam.results.compute', 'exam.results.publish', 'exam.results.correct', 'result.holistic.save']
  const where: Record<string, unknown> = { action: { in: actions } }
  if (!ctx.can('exams.manage')) where.actorId = ctx.user.userId
  if (examId) {
    const sheetIds = (await ctx.db.examSubject.findMany({ where: { examId }, select: { id: true } })).map((s) => s.id)
    where.OR = [{ entityId: examId }, { entityId: { in: sheetIds } }]
  }
  return ctx.db.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, action: true, actorLabel: true, summary: true, after: true, createdAt: true },
  })
}

export const sheetTransitionSchema = z.object({
  examSubjectId: z.string().min(1).max(40),
  to: z.enum(['SUBMITTED', 'LOCKED', 'OPEN']),
})

/**
 * Sheet workflow. Teachers submit their own sheets; administrators may also
 * lock, and reopen anything that is not part of a published exam.
 */
export async function transitionMarksSheet(ctx: AppContext, input: z.infer<typeof sheetTransitionSchema>) {
  ctx.require('exams.marks')
  const isAdmin = ctx.can('exams.manage')
  const sheet = await ctx.db.examSubject.findFirst({
    where: { id: input.examSubjectId },
    select: {
      id: true,
      marksStatus: true,
      closedWithoutMarks: true,
      exam: { select: { id: true, name: true, status: true } },
      classSubject: { select: { teacherId: true, classLevel: { select: { name: true } }, subject: { select: { name: true } } } },
    },
  })
  if (!sheet) throw notFound('Marks sheet')
  if (!isAdmin) {
    const staff = await ctx.db.staff.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } })
    if (!staff || sheet.classSubject.teacherId !== staff.id) throw notFound('Marks sheet')
    if (input.to !== 'SUBMITTED') throw conflict('Only an administrator can lock or reopen a marks sheet')
  }
  if (sheet.exam.status === 'PUBLISHED' && input.to === 'SUBMITTED') throw conflict('Results for this exam are published; an administrator can reopen or lock the sheet')
  if (sheet.marksStatus === input.to) return { status: input.to }
  if (input.to === 'SUBMITTED' && sheet.marksStatus === 'LOCKED') throw conflict('This sheet is already locked')

  const now = new Date()
  const data =
    input.to === 'SUBMITTED'
      ? { marksStatus: 'SUBMITTED' as const, marksSubmittedAt: now, marksSubmittedById: ctx.user.userId }
      : input.to === 'LOCKED'
        ? { marksStatus: 'LOCKED' as const, marksLockedAt: now, marksLockedById: ctx.user.userId }
        : { marksStatus: 'OPEN' as const, marksLockedAt: null, marksLockedById: null, marksSubmittedAt: null, marksSubmittedById: null, closedWithoutMarks: false, closedReason: null }
  await ctx.db.examSubject.update({ where: { id: sheet.id }, data })

  const verb = input.to === 'SUBMITTED' ? 'submit' : input.to === 'LOCKED' ? 'lock' : 'reopen'
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: `exam.marks.${verb}`,
    module: 'exams',
    entityType: 'ExamSubject',
    entityId: sheet.id,
    summary: `${verb === 'submit' ? 'Submitted' : verb === 'lock' ? 'Locked' : 'Reopened'} ${sheet.classSubject.classLevel.name} · ${sheet.classSubject.subject.name} marks for ${sheet.exam.name}`,
    before: { status: sheet.marksStatus, ...(sheet.closedWithoutMarks ? { closedWithoutMarks: true } : {}) },
    after: { status: input.to },
  })
  return { status: input.to }
}

export const sheetCloseSchema = z.object({
  examSubjectId: z.string().min(1).max(40),
  reason: z.string().trim().max(200).optional(),
})

/**
 * Close a paper without (complete) marks — not conducted, no teacher, and so
 * on. The sheet is locked and left out of results; any marks already entered
 * are kept so reopening restores the paper exactly.
 */
export async function closeMarksSheet(ctx: AppContext, input: z.infer<typeof sheetCloseSchema>) {
  ctx.require('exams.manage')
  const sheet = await ctx.db.examSubject.findFirst({
    where: { id: input.examSubjectId },
    select: {
      id: true,
      marksStatus: true,
      closedWithoutMarks: true,
      exam: { select: { name: true, status: true } },
      classSubject: { select: { classLevel: { select: { name: true } }, subject: { select: { name: true } } } },
      _count: { select: { marks: true } },
    },
  })
  if (!sheet) throw notFound('Marks sheet')
  if (sheet.exam.status === 'PUBLISHED') throw conflict('Results for this exam are published; papers can no longer be closed')
  if (sheet.closedWithoutMarks) return { closed: true }

  const reason = input.reason || null
  await ctx.db.examSubject.update({
    where: { id: sheet.id },
    data: { closedWithoutMarks: true, closedReason: reason, marksStatus: 'LOCKED', marksLockedAt: new Date(), marksLockedById: ctx.user.userId },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'exam.marks.close',
    module: 'exams',
    entityType: 'ExamSubject',
    entityId: sheet.id,
    summary: `Closed ${sheet.classSubject.classLevel.name} · ${sheet.classSubject.subject.name} for ${sheet.exam.name} without marks — left out of results`,
    before: { status: sheet.marksStatus },
    after: { status: 'LOCKED', closedWithoutMarks: true, reason, marksKept: sheet._count.marks },
  })
  return { closed: true }
}
