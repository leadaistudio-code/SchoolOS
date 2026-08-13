import type { AppContext } from '@/server/context'
import { ratio, type ReportRange } from './range'

export type AttendanceRollup = Awaited<ReturnType<typeof attendanceRollup>>

/**
 * Attendance as a school reads it, rather than as a register.
 *
 * The per-student register already lives under Attendance; this is the view
 * above it — the daily line, the class table, and the children whose
 * attendance has fallen far enough to threaten exam eligibility.
 *
 * Half-days count as attended. Boards differ on this, but counting a child
 * who came in for the morning as absent is the answer nobody defends.
 */
export async function attendanceRollup(ctx: AppContext, range: ReportRange) {
  ctx.require('reports.view')

  const db = ctx.db
  const tenantId = ctx.tenant.id

  const [totals, daily, byClass, chronic, unmarkedSections] = await Promise.all([
    db.studentAttendance.groupBy({
      by: ['status'],
      where: { onDate: { gte: range.from, lte: range.to } },
      _count: { _all: true },
    }),
    db.$queryRaw<
      { day: string; present: number; absent: number; late: number; marked: number }[]
    >`
      SELECT to_char(a."onDate", 'YYYY-MM-DD') AS day,
             (COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE', 'HALF_DAY')))::int AS present,
             (COUNT(*) FILTER (WHERE a.status = 'ABSENT'))::int AS absent,
             (COUNT(*) FILTER (WHERE a.status = 'LATE'))::int AS late,
             (COUNT(*) FILTER (WHERE a.status <> 'HOLIDAY'))::int AS marked
      FROM "StudentAttendance" a
      WHERE a."tenantId" = ${tenantId}
        AND a."onDate" >= ${range.from}
        AND a."onDate" <= ${range.to}
      GROUP BY 1
      ORDER BY 1`,
    db.$queryRaw<
      {
        id: string
        name: string
        numeric: number
        students: number
        present: number
        absent: number
        late: number
        leave: number
        marked: number
      }[]
    >`
      SELECT cl.id, cl.name, cl.numeric,
             COUNT(DISTINCT a."studentId")::int AS students,
             (COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE', 'HALF_DAY')))::int AS present,
             (COUNT(*) FILTER (WHERE a.status = 'ABSENT'))::int AS absent,
             (COUNT(*) FILTER (WHERE a.status = 'LATE'))::int AS late,
             (COUNT(*) FILTER (WHERE a.status = 'LEAVE'))::int AS "leave",
             (COUNT(*) FILTER (WHERE a.status <> 'HOLIDAY'))::int AS marked
      FROM "StudentAttendance" a
      JOIN "Section" sec ON sec.id = a."sectionId"
      JOIN "ClassLevel" cl ON cl.id = sec."classLevelId"
      WHERE a."tenantId" = ${tenantId}
        AND a."onDate" >= ${range.from}
        AND a."onDate" <= ${range.to}
      GROUP BY cl.id, cl.name, cl.numeric
      ORDER BY cl.numeric ASC`,
    // Below 75% is the threshold most boards use for exam eligibility, so it
    // is the line this list is drawn at.
    db.$queryRaw<
      {
        studentId: string
        name: string
        admissionNo: string
        className: string
        sectionName: string
        present: number
        absent: number
        marked: number
        percent: number
      }[]
    >`
      SELECT a."studentId",
             (st."firstName" || ' ' || st."lastName") AS name,
             st."admissionNo",
             cl.name AS "className",
             sec.name AS "sectionName",
             (COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE', 'HALF_DAY')))::int AS present,
             (COUNT(*) FILTER (WHERE a.status = 'ABSENT'))::int AS absent,
             (COUNT(*) FILTER (WHERE a.status <> 'HOLIDAY'))::int AS marked,
             (
               100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE', 'HALF_DAY'))
               / NULLIF(COUNT(*) FILTER (WHERE a.status <> 'HOLIDAY'), 0)
             )::float8 AS percent
      FROM "StudentAttendance" a
      JOIN "Student" st ON st.id = a."studentId" AND st."deletedAt" IS NULL
      JOIN "Section" sec ON sec.id = a."sectionId"
      JOIN "ClassLevel" cl ON cl.id = sec."classLevelId"
      WHERE a."tenantId" = ${tenantId}
        AND a."onDate" >= ${range.from}
        AND a."onDate" <= ${range.to}
      GROUP BY a."studentId", st."firstName", st."lastName", st."admissionNo", cl.name, sec.name
      HAVING COUNT(*) FILTER (WHERE a.status <> 'HOLIDAY') >= 10
         AND 100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE', 'HALF_DAY'))
             / NULLIF(COUNT(*) FILTER (WHERE a.status <> 'HOLIDAY'), 0) < 75
      ORDER BY percent ASC
      LIMIT 40`,
    // A section that has never been marked in the range is a process problem,
    // not an attendance one, and it is invisible in every average above.
    db.$queryRaw<{ id: string; name: string; className: string }[]>`
      SELECT sec.id, sec.name, cl.name AS "className"
      FROM "Section" sec
      JOIN "ClassLevel" cl ON cl.id = sec."classLevelId"
      WHERE sec."tenantId" = ${tenantId}
        AND sec."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "StudentAttendance" a
          WHERE a."sectionId" = sec.id
            AND a."tenantId" = sec."tenantId"
            AND a."onDate" >= ${range.from}
            AND a."onDate" <= ${range.to}
        )
      ORDER BY cl.numeric ASC, sec.name ASC`,
  ])

  const count = (status: string) => totals.find((t) => t.status === status)?._count._all ?? 0
  const present = count('PRESENT')
  const late = count('LATE')
  const halfDay = count('HALF_DAY')
  const absent = count('ABSENT')
  const leave = count('LEAVE')
  const marked = present + late + halfDay + absent + leave

  const round = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10)

  return {
    range,
    summary: {
      marked,
      attended: present + late + halfDay,
      present,
      absent,
      late,
      leave,
      overall: ratio(present + late + halfDay, marked),
      chronicCount: chronic.length,
      unmarkedSections: unmarkedSections.length,
      /** School days on which anything at all was marked. */
      daysMarked: daily.length,
    },
    daily: daily.map((d) => ({
      day: d.day,
      present: d.present,
      absent: d.absent,
      late: d.late,
      marked: d.marked,
      percent: ratio(d.present, d.marked),
    })),
    byClass: byClass.map((c) => ({
      id: c.id,
      name: c.name,
      students: c.students,
      present: c.present,
      absent: c.absent,
      late: c.late,
      leave: c.leave,
      marked: c.marked,
      percent: ratio(c.present, c.marked),
    })),
    chronic: chronic.map((c) => ({ ...c, percent: round(c.percent) ?? 0 })),
    unmarkedSections,
  }
}
