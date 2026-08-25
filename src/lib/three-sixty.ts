/**
 * Pure helpers behind the student and staff 360° dashboards.
 *
 * Everything here is a total function over plain data: no server imports, no
 * database, no React. The dashboards are server components that fetch and then
 * hand their numbers to these, so the shaping — which slice is which colour,
 * where a mark falls on the RAG scale, whether a note is the student's to see —
 * is decided in one place the unit tests can reach without a running app.
 */

import { bandFor, type ScoreBand } from './score'
import type { DonutSlice } from '@/components/dashboard/charts'

/**
 * The RAG colours a score band paints in.
 *
 * A copy of the map that lives module-locally in `score/score-ui.tsx` — it is
 * not exported from there, and a shared score never renders one colour on the
 * health card and another on a 360° page. Keep the two in step.
 */
export const BAND_COLOUR: Record<ScoreBand, string> = {
  EXCELLENT: 'var(--success)',
  GOOD: 'var(--brand-500)',
  FAIR: 'var(--warning)',
  AT_RISK: 'var(--danger)',
}

/**
 * Attendance statuses on the RAG scale.
 *
 * Present is green; late and half-day are the amber middle (there, but not
 * fully); absent is red. Approved leave is neither good nor bad conduct — it is
 * granted time — so it takes the neutral brand colour rather than a warning.
 */
export const RAG_DONUT_COLOR = {
  present: 'var(--success)',
  late: 'var(--warning)',
  halfDay: 'var(--warning)',
  leave: 'var(--brand-500)',
  absent: 'var(--danger)',
} as const

export type AttendanceCounts = {
  present: number
  late: number
  halfDay: number
  leave: number
  absent: number
}

/**
 * Attendance counts to donut slices, in RAG order.
 *
 * Empty statuses are dropped rather than shown as zero-width slivers — and when
 * every count is zero the result is an empty array, which is exactly what makes
 * `DonutChart` fall back to its built-in "No data" ring instead of drawing a
 * misleading full circle of one colour.
 */
export function attendanceDonutSlices(counts: AttendanceCounts): DonutSlice[] {
  return [
    { key: 'present', label: 'Present', value: counts.present, color: RAG_DONUT_COLOR.present },
    { key: 'late', label: 'Late', value: counts.late, color: RAG_DONUT_COLOR.late },
    { key: 'halfDay', label: 'Half day', value: counts.halfDay, color: RAG_DONUT_COLOR.halfDay },
    { key: 'leave', label: 'On leave', value: counts.leave, color: RAG_DONUT_COLOR.leave },
    { key: 'absent', label: 'Absent', value: counts.absent, color: RAG_DONUT_COLOR.absent },
  ].filter((slice) => slice.value > 0)
}

/** The share of marked days that count as attended, 0–100, or null if none marked. */
export function attendancePercentOf(counts: AttendanceCounts): number | null {
  const marked = counts.present + counts.late + counts.halfDay + counts.leave + counts.absent
  if (marked <= 0) return null
  // Half days count half; approved leave is excluded from both halves rather
  // than counted against, mirroring the register's own rule.
  const credited = counts.present + counts.late + counts.halfDay * 0.5
  const base = marked - counts.leave
  if (base <= 0) return null
  return Math.round((credited / base) * 1000) / 10
}

export type ResultTrendInput = {
  examName: string
  percentage: number
  grade: string | null
}

export type ResultTrendPoint = {
  examName: string
  percent: number
  grade: string | null
  band: ScoreBand
}

/**
 * Published results to a RAG-banded trend, oldest first.
 *
 * The band comes from the same `bandFor` thresholds the health score uses, so a
 * 70% exam reads GOOD on the marks trend and GOOD on the dial — one scale, not
 * two. The caller supplies rows already ordered and rounded upstream is fine;
 * the percentage is re-rounded here so the point is display-ready on its own.
 */
export function resultsToTrend(rows: ResultTrendInput[]): ResultTrendPoint[] {
  return rows.map((row) => ({
    examName: row.examName,
    percent: Math.round(row.percentage * 10) / 10,
    grade: row.grade,
    band: bandFor(row.percentage),
  }))
}

/**
 * Whether a piece of teacher-authored feedback may surface on a student's
 * profile at all.
 *
 * `TEACHER_ONLY` is a teacher's private note to themselves about a child; it is
 * withheld from every reader of the 360° view, staff and admin included. Every
 * other visibility is something the teacher chose to share, so it shows.
 */
export function isSharedFeedback(visibility: string): boolean {
  return visibility !== 'TEACHER_ONLY'
}
