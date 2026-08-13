import type { AppContext } from '@/server/context'
import { monthLabel, monthsBetween, ratio, type ReportRange } from './range'

export type EnrolmentReport = Awaited<ReturnType<typeof enrolmentReport>>

type ClassRow = {
  id: string
  name: string
  numeric: number
  sections: number
  capacity: number
  students: number
  boys: number
  girls: number
}

/**
 * Roll strength, demographics and the services students actually use.
 *
 * This is the report a management meeting opens with, so it answers the two
 * questions that get asked first — how many children are on the roll, and how
 * full each class is — before anything else. Capacity comes from the section
 * record rather than a fixed number, so "full" means what this school decided
 * it means.
 */
export async function enrolmentReport(ctx: AppContext, range: ReportRange) {
  ctx.require('reports.view')

  const db = ctx.db
  const tenantId = ctx.tenant.id

  const session = await db.academicSession.findFirst({ where: { isCurrent: true } })

  const [
    active,
    byStatus,
    byGender,
    byCategory,
    admitted,
    byClass,
    admissionsByMonth,
    transportUsers,
    borrowers,
    withGuardians,
  ] = await Promise.all([
    db.student.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    db.student.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
    db.student.groupBy({
      by: ['gender'],
      where: { status: 'ACTIVE', deletedAt: null },
      _count: { _all: true },
    }),
    db.student.groupBy({
      by: ['category'],
      where: { status: 'ACTIVE', deletedAt: null },
      _count: { _all: true },
    }),
    db.student.count({
      where: { deletedAt: null, admissionDate: { gte: range.from, lte: range.to } },
    }),
    // Sections and enrolments are rolled up one at a time before they meet the
    // class, because summing capacity across a join that has already fanned
    // out over enrolments would multiply every seat by its occupant.
    session
      ? db.$queryRaw<ClassRow[]>`
          WITH sec AS (
            SELECT s.id, s."classLevelId", s.capacity
            FROM "Section" s
            WHERE s."tenantId" = ${tenantId} AND s."deletedAt" IS NULL
          ),
          enr AS (
            SELECT e."sectionId",
                   COUNT(*)::int AS students,
                   (COUNT(*) FILTER (WHERE st.gender = 'MALE'))::int AS boys,
                   (COUNT(*) FILTER (WHERE st.gender = 'FEMALE'))::int AS girls
            FROM "Enrollment" e
            JOIN "Student" st ON st.id = e."studentId" AND st."deletedAt" IS NULL
            WHERE e."tenantId" = ${tenantId} AND e."isCurrent" = true
            GROUP BY e."sectionId"
          )
          SELECT cl.id, cl.name, cl.numeric,
                 COUNT(sec.id)::int AS sections,
                 COALESCE(SUM(sec.capacity), 0)::int AS capacity,
                 COALESCE(SUM(enr.students), 0)::int AS students,
                 COALESCE(SUM(enr.boys), 0)::int AS boys,
                 COALESCE(SUM(enr.girls), 0)::int AS girls
          FROM "ClassLevel" cl
          LEFT JOIN sec ON sec."classLevelId" = cl.id
          LEFT JOIN enr ON enr."sectionId" = sec.id
          WHERE cl."tenantId" = ${tenantId}
            AND cl."deletedAt" IS NULL
            AND cl."sessionId" = ${session.id}
          GROUP BY cl.id, cl.name, cl.numeric
          ORDER BY cl.numeric ASC`
      : Promise.resolve([] as ClassRow[]),
    db.$queryRaw<{ month: string; count: number }[]>`
      SELECT to_char(date_trunc('month', s."admissionDate"), 'YYYY-MM') AS month,
             COUNT(*)::int AS count
      FROM "Student" s
      WHERE s."tenantId" = ${tenantId}
        AND s."deletedAt" IS NULL
        AND s."admissionDate" >= ${range.from}
        AND s."admissionDate" <= ${range.to}
      GROUP BY 1
      ORDER BY 1`,
    db.transportAssignment.count({ where: { isActive: true } }),
    db.libraryLoan.count({ where: { status: { in: ['ISSUED', 'OVERDUE'] } } }),
    db.student.count({ where: { status: 'ACTIVE', deletedAt: null, guardians: { some: {} } } }),
  ])

  const capacity = byClass.reduce((sum, c) => sum + c.capacity, 0)
  const enrolled = byClass.reduce((sum, c) => sum + c.students, 0)
  const monthIndex = new Map(admissionsByMonth.map((r) => [r.month, r.count]))

  return {
    range,
    session,
    summary: {
      active,
      admittedInRange: admitted,
      capacity,
      enrolled,
      utilisation: ratio(enrolled, capacity),
      seatsFree: Math.max(0, capacity - enrolled),
      transportUsers,
      borrowers,
      /** A student with no guardian on file cannot be reached in an emergency. */
      withoutGuardian: active - withGuardians,
    },
    byStatus: byStatus
      .map((s) => ({ status: s.status, count: s._count._all }))
      .sort((a, b) => b.count - a.count),
    byGender: byGender
      .map((g) => ({ gender: g.gender ?? 'Not recorded', count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    byCategory: byCategory
      .map((c) => ({ category: c.category || 'Not recorded', count: c._count._all }))
      .sort((a, b) => b.count - a.count),
    byClass: byClass.map((c) => ({
      id: c.id,
      name: c.name,
      sections: c.sections,
      capacity: c.capacity,
      students: c.students,
      boys: c.boys,
      girls: c.girls,
      utilisation: ratio(c.students, c.capacity),
      seatsFree: Math.max(0, c.capacity - c.students),
    })),
    admissionsTrend: monthsBetween(range.from, range.to).map((month) => ({
      month,
      label: monthLabel(month),
      count: monthIndex.get(month) ?? 0,
    })),
  }
}
