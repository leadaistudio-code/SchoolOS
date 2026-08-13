import type { AppContext } from '@/server/context'
import { ratio } from './range'

export type AcademicReport = Awaited<ReturnType<typeof academicReport>>

/**
 * Exam performance.
 *
 * Scoped to one exam rather than a date range: "how did Class 8 do" is only a
 * question about a particular paper set, and averaging a unit test into a
 * final would produce a number nobody could act on. The picker offers the
 * exams that have results, newest first.
 *
 * Absentees are counted but kept out of every average. A child who did not
 * sit the paper has no mark to average, and treating a blank as a zero would
 * quietly punish a class for an illness.
 */
export async function academicReport(
  ctx: AppContext,
  options: { examId?: string; classLevelId?: string },
) {
  ctx.require('reports.view')

  const db = ctx.db
  const tenantId = ctx.tenant.id

  const exams = await db.exam.findMany({
    where: { results: { some: {} } },
    orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
    take: 40,
    select: {
      id: true,
      name: true,
      kind: true,
      status: true,
      startsOn: true,
      publishedAt: true,
      session: { select: { name: true } },
      _count: { select: { results: true } },
    },
  })

  const exam = exams.find((e) => e.id === options.examId) ?? exams[0] ?? null
  if (!exam) {
    return { exams, exam: null, classes: [], summary: null, grades: [], byClass: [], bySubject: [], toppers: [], strugglers: [] }
  }

  // The class filter is applied through the current enrolment, the same join
  // the class breakdown uses, so a filtered page is a slice of the table
  // above it rather than a differently-derived number.
  const enrolmentFilter = options.classLevelId
    ? { student: { enrollments: { some: { classLevelId: options.classLevelId, isCurrent: true } } } }
    : {}

  const [classes, aggregate, passed, absentMarks, grades, byClass, bySubject, toppers, strugglers] =
    await Promise.all([
      db.classLevel.findMany({
        where: { deletedAt: null, examClasses: { some: { examId: exam.id } } },
        orderBy: { numeric: 'asc' },
        select: { id: true, name: true },
      }),
      db.result.aggregate({
        where: { examId: exam.id, ...enrolmentFilter },
        _avg: { percentage: true },
        _max: { percentage: true },
        _min: { percentage: true },
        _count: { _all: true },
      }),
      db.result.count({ where: { examId: exam.id, isPass: true, ...enrolmentFilter } }),
      db.mark.count({ where: { examSubject: { examId: exam.id }, isAbsent: true } }),
      db.result.groupBy({
        by: ['grade'],
        where: { examId: exam.id, ...enrolmentFilter },
        _count: { _all: true },
      }),
      db.$queryRaw<
        {
          id: string
          name: string
          numeric: number
          students: number
          average: number | null
          highest: number | null
          passed: number
        }[]
      >`
        SELECT cl.id, cl.name, cl.numeric,
               COUNT(*)::int AS students,
               AVG(r.percentage)::float8 AS average,
               MAX(r.percentage)::float8 AS highest,
               (COUNT(*) FILTER (WHERE r."isPass"))::int AS passed
        FROM "Result" r
        JOIN "Enrollment" e
          ON e."studentId" = r."studentId" AND e."tenantId" = r."tenantId" AND e."isCurrent" = true
        JOIN "ClassLevel" cl ON cl.id = e."classLevelId"
        WHERE r."tenantId" = ${tenantId} AND r."examId" = ${exam.id}
        GROUP BY cl.id, cl.name, cl.numeric
        ORDER BY cl.numeric ASC`,
      db.$queryRaw<
        {
          subject: string
          code: string
          className: string
          numeric: number
          maxMarks: number
          appeared: number
          absent: number
          average: number | null
          highest: number | null
          passed: number
        }[]
      >`
        SELECT s.name AS subject, s.code, cl.name AS "className", cl.numeric,
               es."maxMarks"::float8 AS "maxMarks",
               (COUNT(*) FILTER (WHERE NOT m."isAbsent"))::int AS appeared,
               (COUNT(*) FILTER (WHERE m."isAbsent"))::int AS absent,
               (AVG(m."marksObtained") FILTER (WHERE NOT m."isAbsent"))::float8 AS average,
               (MAX(m."marksObtained") FILTER (WHERE NOT m."isAbsent"))::float8 AS highest,
               (COUNT(*) FILTER (
                 WHERE NOT m."isAbsent" AND m."marksObtained" >= es."passMarks"
               ))::int AS passed
        FROM "Mark" m
        JOIN "ExamSubject" es ON es.id = m."examSubjectId"
        JOIN "ClassSubject" cs ON cs.id = es."classSubjectId"
        JOIN "Subject" s ON s.id = cs."subjectId"
        JOIN "ClassLevel" cl ON cl.id = cs."classLevelId"
        WHERE m."tenantId" = ${tenantId} AND es."examId" = ${exam.id}
        GROUP BY s.name, s.code, cl.name, cl.numeric, es."maxMarks"
        ORDER BY cl.numeric ASC, s.name ASC`,
      db.result.findMany({
        where: { examId: exam.id, ...enrolmentFilter },
        orderBy: [{ percentage: 'desc' }],
        take: 10,
        select: {
          percentage: true,
          grade: true,
          rankInClass: true,
          totalObtained: true,
          totalMax: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              enrollments: {
                where: { isCurrent: true },
                take: 1,
                select: {
                  classLevel: { select: { name: true } },
                  section: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
      db.result.findMany({
        where: { examId: exam.id, isPass: false, ...enrolmentFilter },
        orderBy: [{ percentage: 'asc' }],
        take: 15,
        select: {
          percentage: true,
          grade: true,
          rankInClass: true,
          totalObtained: true,
          totalMax: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              enrollments: {
                where: { isCurrent: true },
                take: 1,
                select: {
                  classLevel: { select: { name: true } },
                  section: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
    ])

  const assessed = aggregate._count._all
  const round = (n: number | null | undefined) =>
    n === null || n === undefined ? null : Math.round(n * 10) / 10

  const named = (r: (typeof toppers)[number]) => {
    const enrolment = r.student.enrollments[0]
    return {
      studentId: r.student.id,
      name: `${r.student.firstName} ${r.student.lastName}`.trim(),
      admissionNo: r.student.admissionNo,
      className: enrolment ? `${enrolment.classLevel.name} ${enrolment.section.name}`.trim() : '—',
      percentage: round(r.percentage) ?? 0,
      grade: r.grade,
      totalObtained: r.totalObtained,
      totalMax: r.totalMax,
    }
  }

  return {
    exams,
    exam,
    classes,
    summary: {
      assessed,
      passed,
      failed: assessed - passed,
      passRate: ratio(passed, assessed),
      average: round(aggregate._avg.percentage),
      highest: round(aggregate._max.percentage),
      lowest: round(aggregate._min.percentage),
      absentMarks,
    },
    grades: grades
      .map((g) => ({ grade: g.grade ?? 'Ungraded', count: g._count._all }))
      .sort((a, b) => a.grade.localeCompare(b.grade)),
    byClass: byClass.map((c) => ({
      id: c.id,
      name: c.name,
      students: c.students,
      average: round(c.average),
      highest: round(c.highest),
      passed: c.passed,
      passRate: ratio(c.passed, c.students),
    })),
    bySubject: bySubject.map((s) => ({
      subject: s.subject,
      code: s.code,
      className: s.className,
      maxMarks: s.maxMarks,
      appeared: s.appeared,
      absent: s.absent,
      average: round(s.average),
      highest: round(s.highest),
      averagePercent: s.average === null ? null : ratio(s.average, s.maxMarks),
      passRate: ratio(s.passed, s.appeared),
    })),
    toppers: toppers.map(named),
    strugglers: strugglers.map(named),
  }
}
