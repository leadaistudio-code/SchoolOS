import type { AppContext } from '@/server/context'
import { readinessFromPercent } from './scoring'
import { resolveConfig } from './service'

/**
 * Faculty readiness analytics for oversight roles (principal / admin).
 *
 * Everything here is INTERNAL professional-development information. It is gated
 * behind `teacher_refresh.view_school` / `view_department`, never reaches a
 * parent or student surface, and is not part of any public API. It exists to
 * help a school support its teachers — spot who could use a hand and offer it —
 * not to rank or penalise anyone. There is deliberately no "worst teachers"
 * sort and no employment-decision output; the numbers inform a human, they do
 * not act on their own.
 */

type TeacherReadinessRow = {
  teacherId: string
  name: string
  department: string | null
  assigned: number
  completed: number
  overdue: number
  /** Average of latest-attempt percentages across completed refreshers. */
  averagePercent: number | null
  readinessLabel: string | null
  lastActivityAt: Date | null
}

/**
 * The school-wide readiness snapshot: a headline completion rate, a per-teacher
 * table, a department roll-up, and a short list of supportive alerts.
 */
export async function facultyReadinessOverview(ctx: AppContext) {
  ctx.require('teacher_refresh.view_school')
  return computeReadiness(ctx)
}

/** A single department's readiness, for the department view. */
export async function departmentReadiness(ctx: AppContext, department: string) {
  ctx.require('teacher_refresh.view_department')
  const overview = await computeReadiness(ctx)
  const key = department.trim() || 'Unassigned'
  return {
    department: key,
    teachers: overview.teachers.filter((t) => (t.department?.trim() || 'Unassigned') === key),
    rollup: overview.departments.find((d) => d.department === key) ?? null,
  }
}

/** The shared aggregation. Ungated — callers above apply the right permission. */
async function computeReadiness(ctx: AppContext) {
  const config = await resolveConfig(ctx)
  const now = new Date()

  const teachers = await ctx.db.staff.findMany({
    where: { staffType: 'TEACHING', deletedAt: null },
    select: { id: true, firstName: true, lastName: true, department: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 500,
  })

  const assessments = await ctx.db.teacherRefreshAssessment.findMany({
    where: { teacherId: { in: teachers.map((t) => t.id) } },
    select: {
      teacherId: true,
      status: true,
      dueAt: true,
      attempts: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { score: true, maxScore: true, submittedAt: true },
      },
    },
    take: 5000,
  })

  const byTeacher = new Map<string, typeof assessments>()
  for (const a of assessments) {
    const list = byTeacher.get(a.teacherId) ?? []
    list.push(a)
    byTeacher.set(a.teacherId, list)
  }

  const rows: TeacherReadinessRow[] = teachers.map((t) => {
    const list = byTeacher.get(t.id) ?? []
    const assigned = list.length
    let completed = 0
    let overdue = 0
    const percents: number[] = []
    let lastActivityAt: Date | null = null

    for (const a of list) {
      const isOverdue = a.status === 'OVERDUE' || (a.status === 'PENDING' && a.dueAt < now)
      if (a.status === 'COMPLETED') completed += 1
      if (isOverdue) overdue += 1
      const attempt = a.attempts[0]
      if (attempt && attempt.maxScore && attempt.maxScore > 0 && attempt.score != null) {
        percents.push(Math.round((attempt.score / attempt.maxScore) * 1000) / 10)
        if (attempt.submittedAt && (!lastActivityAt || attempt.submittedAt > lastActivityAt)) {
          lastActivityAt = attempt.submittedAt
        }
      }
    }

    const averagePercent =
      percents.length > 0
        ? Math.round((percents.reduce((s, p) => s + p, 0) / percents.length) * 10) / 10
        : null

    return {
      teacherId: t.id,
      name: `${t.firstName} ${t.lastName}`.trim(),
      department: t.department,
      assigned,
      completed,
      overdue,
      averagePercent,
      readinessLabel:
        averagePercent == null
          ? null
          : readinessFromPercent(averagePercent, config.passingThreshold).label,
      lastActivityAt,
    }
  })

  // School headline: completion rate across all assigned refreshers, and the
  // share of teachers who have no outstanding (overdue) work.
  const totalAssigned = rows.reduce((s, r) => s + r.assigned, 0)
  const totalCompleted = rows.reduce((s, r) => s + r.completed, 0)
  const teachersWithWork = rows.filter((r) => r.assigned > 0)
  const teachersUpToDate = teachersWithWork.filter((r) => r.overdue === 0).length

  const departments = rollUpByDepartment(rows)
  const alerts = buildAlerts(rows, config.passingThreshold)

  return {
    enabled: config.enabled,
    headline: {
      teacherCount: teachers.length,
      completionRate: totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 1000) / 10 : null,
      teachersUpToDate,
      teachersWithWork: teachersWithWork.length,
    },
    departments,
    teachers: rows,
    alerts,
  }
}

type DepartmentRollup = {
  department: string
  teacherCount: number
  assigned: number
  completed: number
  completionRate: number | null
  averagePercent: number | null
}

function rollUpByDepartment(rows: TeacherReadinessRow[]): DepartmentRollup[] {
  const groups = new Map<string, TeacherReadinessRow[]>()
  for (const r of rows) {
    const key = r.department?.trim() || 'Unassigned'
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  return [...groups.entries()]
    .map(([department, list]) => {
      const assigned = list.reduce((s, r) => s + r.assigned, 0)
      const completed = list.reduce((s, r) => s + r.completed, 0)
      const withScore = list.filter((r) => r.averagePercent != null)
      const averagePercent =
        withScore.length > 0
          ? Math.round(
              (withScore.reduce((s, r) => s + (r.averagePercent ?? 0), 0) / withScore.length) * 10,
            ) / 10
          : null
      return {
        department,
        teacherCount: list.length,
        assigned,
        completed,
        completionRate: assigned > 0 ? Math.round((completed / assigned) * 1000) / 10 : null,
        averagePercent,
      }
    })
    .sort((a, b) => a.department.localeCompare(b.department))
}

type ReadinessAlert = {
  kind: 'OVERDUE' | 'ADDITIONAL_REVIEW'
  teacherId: string
  teacherName: string
  message: string
}

/**
 * Supportive, actionable prompts — "who might appreciate a hand" — never a
 * ranking. Kept deliberately short and phrased as support, not censure.
 */
function buildAlerts(rows: TeacherReadinessRow[], passingThreshold: number): ReadinessAlert[] {
  const alerts: ReadinessAlert[] = []

  for (const r of rows) {
    if (r.overdue > 0) {
      alerts.push({
        kind: 'OVERDUE',
        teacherId: r.teacherId,
        teacherName: r.name,
        message: `${r.overdue} refresher${r.overdue > 1 ? 's' : ''} past the window — a reminder or an extension may help.`,
      })
    } else if (r.averagePercent != null && r.averagePercent < passingThreshold) {
      alerts.push({
        kind: 'ADDITIONAL_REVIEW',
        teacherId: r.teacherId,
        teacherName: r.name,
        message: 'Recent refreshers suggest some topics are worth a fuller review — consider offering support.',
      })
    }
  }

  // Overdue first, then review suggestions; cap so the panel stays actionable.
  return alerts.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'OVERDUE' ? -1 : 1)).slice(0, 20)
}
