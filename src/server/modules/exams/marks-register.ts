import { z } from 'zod'
import type { MarksSheetStatus } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { resolveBrandingAssetUrl } from '@/server/branding-assets'
import { classSubjectAppliesToSection } from './section-subjects'
import { gradeForPercent } from './service'

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional()).catch(undefined)

export const marksRegisterFilterSchema = z.object({
  exam: optional(z.string().max(40)),
  classLevelId: optional(z.string().max(40)),
  sectionId: optional(z.string().max(40)),
  status: optional(z.enum(['COMPLETE', 'PENDING', 'OPEN', 'SUBMITTED', 'LOCKED'])),
})
export type MarksRegisterFilters = z.infer<typeof marksRegisterFilterSchema>

export type SectionCompletion = 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED'

export type RegisterCell =
  | { kind: 'na' }
  | { kind: 'missing' }
  | { kind: 'absent' }
  | { kind: 'mark'; value: number; fail: boolean }

export type RegisterSubject = {
  sheetId: string
  name: string
  code: string
  maxMarks: number
  passMarks: number
  status: MarksSheetStatus
  teacher: string
}

export type RegisterRow = {
  studentId: string
  rollNumber: number | null
  name: string
  admissionNo: string
  sectionId: string
  sectionName: string
  cells: Record<string, RegisterCell>
  obtained: number
  max: number
  percent: number | null
  grade: string | null
  result: 'PASS' | 'FAIL' | null
  complete: boolean
  entered: number
  expected: number
  rank: number | null
}

export type RegisterSheet = {
  className: string
  sectionName: string | null
  subjects: RegisterSubject[]
  rows: RegisterRow[]
}

/** Rounded to one decimal, the way schools print percentages. */
export const pct = (obtained: number, max: number) => (max > 0 ? Math.round((obtained / max) * 1000) / 10 : 0)

/** Dense rank by percentage among students whose marks are complete. */
export function rankRows(rows: RegisterRow[]) {
  const ranked = rows.filter((r) => r.complete && r.percent !== null).sort((a, b) => b.percent! - a.percent! || b.obtained - a.obtained)
  let rank = 0
  let prev: RegisterRow | null = null
  ranked.forEach((row, i) => {
    if (!prev || prev.percent !== row.percent || prev.obtained !== row.obtained) rank = i + 1
    row.rank = rank
    prev = row
  })
}

/** One student's line across the papers of their class. */
export function buildRow(
  student: { studentId: string; rollNumber: number | null; name: string; admissionNo: string; sectionId: string; sectionName: string },
  subjects: Array<RegisterSubject & { sections: string[]; elective?: boolean }>,
  marks: Map<string, { marksObtained: number | null; isAbsent: boolean; notApplicable?: boolean }>,
  bands: Array<{ grade: string; minPercent: number; maxPercent: number; isPass: boolean }>,
  passRule: { passRule: string; passPercent: number } = { passRule: 'ALL_PAPERS', passPercent: 33 },
): RegisterRow {
  const cells: Record<string, RegisterCell> = {}
  let obtained = 0
  let max = 0
  let entered = 0
  let expected = 0
  let failed = false
  for (const s of subjects) {
    const mark = marks.get(`${s.sheetId}:${student.studentId}`)
    if (!classSubjectAppliesToSection(s.sections, student.sectionId) || (s.elective && !mark) || mark?.notApplicable) {
      cells[s.sheetId] = { kind: 'na' }
      continue
    }
    expected++
    if (!mark) {
      cells[s.sheetId] = { kind: 'missing' }
      continue
    }
    entered++
    max += s.maxMarks
    if (mark.isAbsent || mark.marksObtained === null) {
      cells[s.sheetId] = { kind: 'absent' }
      failed = true
      continue
    }
    const fail = mark.marksObtained < s.passMarks
    if (fail) failed = true
    obtained += mark.marksObtained
    cells[s.sheetId] = { kind: 'mark', value: mark.marksObtained, fail }
  }
  const complete = expected > 0 && entered === expected
  const percent = entered > 0 ? pct(obtained, max) : null
  const band = complete && percent !== null ? gradeForPercent(percent, bands) : null
  return {
    ...student,
    cells,
    obtained,
    max,
    percent,
    grade: band?.grade ?? null,
    result: !complete
      ? null
      : passRule.passRule === 'OVERALL'
        ? (percent ?? 0) >= passRule.passPercent ? 'PASS' : 'FAIL'
        : failed || band?.isPass === false ? 'FAIL' : 'PASS',
    complete,
    entered,
    expected,
    rank: null,
  }
}

export function sectionCompletion(entered: number, expected: number): SectionCompletion {
  if (expected > 0 && entered >= expected) return 'COMPLETED'
  return entered > 0 ? 'IN_PROGRESS' : 'NOT_STARTED'
}

/**
 * The principal's view of marks: every class-section of an exam with its
 * completion status, and the full student × subject register for the chosen
 * class (or section). Used by the page, the Excel export and the PDF.
 */
export async function marksRegister(ctx: AppContext, filters: MarksRegisterFilters, options: { perSection?: boolean } = {}) {
  ctx.require('exams.marks')
  if (!ctx.can('exams.manage') && !ctx.can('results.view')) ctx.require('results.view')

  const exams = await ctx.db.exam.findMany({
    where: { status: { not: 'ARCHIVED' }, subjects: { some: {} } },
    orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      status: true,
      sessionId: true,
      startsOn: true,
      endsOn: true,
      session: { select: { name: true } },
      gradingScale: { select: { passRule: true, passPercent: true, bands: { orderBy: { minPercent: 'desc' }, select: { grade: true, minPercent: true, maxPercent: true, isPass: true } } } },
    },
  })
  const exam = exams.find((e) => e.id === filters.exam) ?? exams[0] ?? null

  const school = await ctx.db.school.findFirst({
    where: { tenantId: ctx.tenant.id },
    select: {
      name: true,
      code: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      email: true,
      website: true,
      branding: { select: { logoUrl: true, signatureUrl: true } },
    },
  })
  const schoolInfo = {
    name: school?.name ?? ctx.tenant.school?.name ?? ctx.tenant.name,
    address: school
      ? [school.addressLine1, school.addressLine2, [school.city, school.state, school.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : '',
    contact: [school?.phone && `Ph: ${school.phone}`, school?.email, school?.website].filter(Boolean).join(' · '),
    logoUrl: resolveBrandingAssetUrl(school?.branding?.logoUrl, 'logo'),
    signatureUrl: resolveBrandingAssetUrl(school?.branding?.signatureUrl, 'signature'),
  }

  if (!exam) {
    return {
      exams,
      exam: null,
      school: schoolInfo,
      sections: [],
      classes: [],
      sectionOptions: [],
      register: null as RegisterSheet | null,
      sectionRegisters: [] as RegisterSheet[],
      totals: emptyTotals(),
    }
  }

  let bands = exam.gradingScale?.bands ?? []
  let passRule = exam.gradingScale ?? { passRule: 'ALL_PAPERS', passPercent: 33 }
  if (!bands.length) {
    const fallback = await ctx.db.gradingScale.findFirst({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { passRule: true, passPercent: true, bands: { orderBy: { minPercent: 'desc' }, select: { grade: true, minPercent: true, maxPercent: true, isPass: true } } },
    })
    bands = fallback?.bands ?? []
    if (fallback) passRule = fallback
  }

  const sheets = await ctx.db.examSubject.findMany({
    where: { examId: exam.id },
    orderBy: [{ classSubject: { classLevel: { numeric: 'asc' } } }, { examDate: 'asc' }, { classSubject: { subject: { name: 'asc' } } }],
    select: {
      id: true,
      maxMarks: true,
      passMarks: true,
      marksStatus: true,
      classSubject: {
        select: {
          classLevelId: true,
          classLevel: { select: { name: true, numeric: true } },
          subject: { select: { name: true, code: true, isElective: true } },
          teacher: { select: { firstName: true, lastName: true } },
          sections: { select: { sectionId: true } },
        },
      },
    },
  })

  const subjectsByClass = new Map<string, Array<RegisterSubject & { sections: string[]; elective: boolean }>>()
  const classMeta = new Map<string, { name: string; numeric: number }>()
  for (const s of sheets) {
    const cid = s.classSubject.classLevelId
    classMeta.set(cid, { name: s.classSubject.classLevel.name, numeric: s.classSubject.classLevel.numeric })
    subjectsByClass.set(cid, [
      ...(subjectsByClass.get(cid) ?? []),
      {
        sheetId: s.id,
        name: s.classSubject.subject.name,
        code: s.classSubject.subject.code,
        maxMarks: s.maxMarks,
        passMarks: s.passMarks,
        status: s.marksStatus,
        teacher: s.classSubject.teacher ? `${s.classSubject.teacher.firstName} ${s.classSubject.teacher.lastName}`.trim() : '',
        sections: s.classSubject.sections.map((x) => x.sectionId),
        elective: s.classSubject.subject.isElective,
      },
    ])
  }

  const [enrollments, marks] = await Promise.all([
    ctx.db.enrollment.findMany({
      where: { sessionId: exam.sessionId, classLevelId: { in: [...classMeta.keys()] }, student: { deletedAt: null } },
      orderBy: [{ section: { name: 'asc' } }, { rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
      select: {
        studentId: true,
        classLevelId: true,
        sectionId: true,
        rollNumber: true,
        section: { select: { name: true } },
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
      },
    }),
    ctx.db.mark.findMany({
      where: { examSubjectId: { in: sheets.map((s) => s.id) } },
      select: { examSubjectId: true, studentId: true, marksObtained: true, isAbsent: true, notApplicable: true },
    }),
  ])
  const markMap = new Map(marks.map((m) => [`${m.examSubjectId}:${m.studentId}`, m]))

  const rowsByClass = new Map<string, RegisterRow[]>()
  for (const e of enrollments) {
    const row = buildRow(
      {
        studentId: e.studentId,
        rollNumber: e.rollNumber,
        name: `${e.student.firstName} ${e.student.lastName}`.trim(),
        admissionNo: e.student.admissionNo,
        sectionId: e.sectionId,
        sectionName: e.section.name,
      },
      subjectsByClass.get(e.classLevelId) ?? [],
      markMap,
      bands,
      passRule,
    )
    rowsByClass.set(e.classLevelId, [...(rowsByClass.get(e.classLevelId) ?? []), row])
  }

  type SectionSummary = {
    key: string
    classLevelId: string
    className: string
    numeric: number
    sectionId: string
    sectionName: string
    students: number
    completeStudents: number
    subjects: number
    sheetsLocked: number
    sheetsSubmitted: number
    entered: number
    expected: number
    percent: number
    status: SectionCompletion
    passed: number
    failed: number
    average: number | null
  }
  const sectionMap = new Map<string, SectionSummary & { pctSum: number }>()
  for (const [classLevelId, rows] of rowsByClass) {
    const meta = classMeta.get(classLevelId)!
    const subjects = subjectsByClass.get(classLevelId) ?? []
    for (const r of rows) {
      const key = `${classLevelId}:${r.sectionId}`
      const s = sectionMap.get(key) ?? {
        key,
        classLevelId,
        className: meta.name,
        numeric: meta.numeric,
        sectionId: r.sectionId,
        sectionName: r.sectionName,
        students: 0,
        completeStudents: 0,
        subjects: subjects.filter((x) => classSubjectAppliesToSection(x.sections, r.sectionId)).length,
        sheetsLocked: subjects.filter((x) => x.status === 'LOCKED' && classSubjectAppliesToSection(x.sections, r.sectionId)).length,
        sheetsSubmitted: subjects.filter((x) => x.status === 'SUBMITTED' && classSubjectAppliesToSection(x.sections, r.sectionId)).length,
        entered: 0,
        expected: 0,
        percent: 0,
        status: 'NOT_STARTED' as SectionCompletion,
        passed: 0,
        failed: 0,
        average: null,
        pctSum: 0,
      }
      s.students++
      s.entered += r.entered
      s.expected += r.expected
      if (r.complete) {
        s.completeStudents++
        s.pctSum += r.percent ?? 0
      }
      if (r.result === 'PASS') s.passed++
      if (r.result === 'FAIL') s.failed++
      sectionMap.set(key, s)
    }
  }
  const allSections = [...sectionMap.values()]
    .map(({ pctSum, ...s }) => ({
      ...s,
      percent: s.expected ? Math.floor((s.entered / s.expected) * 100) : 0,
      status: sectionCompletion(s.entered, s.expected),
      average: s.completeStudents ? Math.round((pctSum / s.completeStudents) * 10) / 10 : null,
    }))
    .sort((a, b) => a.numeric - b.numeric || a.className.localeCompare(b.className) || a.sectionName.localeCompare(b.sectionName))

  const sectionStatusMatch = (s: (typeof allSections)[number]) => {
    switch (filters.status) {
      case 'COMPLETE': return s.status === 'COMPLETED'
      case 'PENDING': return s.status !== 'COMPLETED'
      case 'LOCKED': return s.subjects > 0 && s.sheetsLocked === s.subjects
      case 'SUBMITTED': return s.sheetsSubmitted > 0
      case 'OPEN': return s.sheetsLocked + s.sheetsSubmitted < s.subjects
      default: return true
    }
  }
  const sections = allSections.filter(
    (s) =>
      (!filters.classLevelId || s.classLevelId === filters.classLevelId) &&
      (!filters.sectionId || s.sectionId === filters.sectionId) &&
      sectionStatusMatch(s),
  )

  const buildRegister = (classLevelId: string, sectionId?: string): RegisterSheet => {
    const subjects = (subjectsByClass.get(classLevelId) ?? []).filter(
      (s) => !sectionId || classSubjectAppliesToSection(s.sections, sectionId),
    )
    // Fresh row copies: rank is per register (class-wide vs one section).
    let rows = (rowsByClass.get(classLevelId) ?? []).filter((r) => !sectionId || r.sectionId === sectionId).map((r) => ({ ...r, rank: null }))
    rankRows(rows)
    if (filters.status === 'COMPLETE') rows = rows.filter((r) => r.complete)
    if (filters.status === 'PENDING') rows = rows.filter((r) => !r.complete)
    return {
      className: classMeta.get(classLevelId)!.name,
      sectionName: sectionId ? (allSections.find((s) => s.classLevelId === classLevelId && s.sectionId === sectionId)?.sectionName ?? null) : null,
      subjects: subjects.map(({ sections: _s, ...rest }) => rest),
      rows,
    }
  }

  const register = filters.classLevelId && classMeta.has(filters.classLevelId) ? buildRegister(filters.classLevelId, filters.sectionId) : null
  const sectionRegisters = options.perSection ? sections.map((s) => buildRegister(s.classLevelId, s.sectionId)) : []

  const classes = [...classMeta.entries()]
    .map(([id, m]) => ({ id, name: m.name, numeric: m.numeric }))
    .sort((a, b) => a.numeric - b.numeric)
  const sectionOptions = allSections
    .filter((s) => !filters.classLevelId || s.classLevelId === filters.classLevelId)
    .map((s) => ({ id: s.sectionId, label: `${s.className} · ${s.sectionName}` }))

  return {
    exams,
    exam,
    school: schoolInfo,
    sections,
    classes,
    sectionOptions,
    register,
    sectionRegisters,
    totals: {
      sections: allSections.length,
      completed: allSections.filter((s) => s.status === 'COMPLETED').length,
      inProgress: allSections.filter((s) => s.status === 'IN_PROGRESS').length,
      notStarted: allSections.filter((s) => s.status === 'NOT_STARTED').length,
      students: allSections.reduce((n, s) => n + s.students, 0),
      completeStudents: allSections.reduce((n, s) => n + s.completeStudents, 0),
    },
  }
}

function emptyTotals() {
  return { sections: 0, completed: 0, inProgress: 0, notStarted: 0, students: 0, completeStudents: 0 }
}

export type MarksRegister = Awaited<ReturnType<typeof marksRegister>>

export function cellText(cell: RegisterCell | undefined): string {
  if (!cell || cell.kind === 'na') return '—'
  if (cell.kind === 'missing') return ''
  if (cell.kind === 'absent') return 'AB'
  return Number.isInteger(cell.value) ? String(cell.value) : cell.value.toFixed(1)
}

export const SECTION_STATUS_LABEL: Record<SectionCompletion, string> = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In progress',
  NOT_STARTED: 'Not started',
}
