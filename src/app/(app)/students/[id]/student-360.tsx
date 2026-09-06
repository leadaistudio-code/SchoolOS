import type { AppContext } from '@/server/context'
import { formatDay, toDateInput } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { bandMeta } from '@/lib/score'
import { BAND_COLOUR, attendanceDonutSlices, attendancePercentOf } from '@/lib/three-sixty'
import { scoreStudents } from '@/server/modules/score/service'
import { attendanceReport } from '@/server/modules/attendance/service'
import { studentResultsTrend, listStudentFeedback } from '@/server/modules/students/performance'
import type { getStudent } from '@/server/modules/students/service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { ScoreDial, CoverageNote, MetricBreakdown } from '@/app/(app)/score/score-ui'
import { DonutChart } from '@/components/dashboard/charts'

type StudentRecord = Awaited<ReturnType<typeof getStudent>>

/**
 * One child, at a glance.
 *
 * A staff/admin-facing read of the whole record on the RAG scale — the health
 * score, the register, the marks and the shared feedback in one place. Every
 * section gates itself on the reading permission and renders an empty state
 * rather than an error when the viewer may see the tab but not that signal, so
 * a class teacher without `score.view` still gets attendance and feedback. All
 * reads run through the tenant-scoped `ctx` and `assertStudentAccess`, so a
 * parent reaching their own child's 360° sees only what they are entitled to.
 */
export async function Student360({
  ctx,
  student,
}: {
  ctx: AppContext
  student: StudentRecord
}) {
  const canScore = ctx.can('score.view')
  const canAttendance = ctx.can('attendance.view')
  const canResults = ctx.can('results.view')
  const canFeedback = ctx.can('feedback.view')

  // The register runs across the whole live session, so the donut is the year
  // to date rather than an arbitrary window. attendanceReport rejects a span of
  // over a year, though, and a session left open past its close date can exceed
  // that — so the start is clamped to a year back. A year to date is the most
  // this donut ever needs, and in normal data the session is shorter and shows
  // in full.
  const session = canAttendance
    ? await ctx.db.academicSession.findFirst({
        where: { isCurrent: true },
        select: { startsOn: true },
      })
    : null
  const today = new Date()
  const earliest = new Date(today)
  earliest.setUTCDate(earliest.getUTCDate() - 365)
  const sessionStart = session?.startsOn ?? new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
  const from = toDateInput(sessionStart > earliest ? sessionStart : earliest)
  const to = toDateInput(today)

  const [scoreSummary, attendance, trend, feedback] = await Promise.all([
    canScore ? scoreStudents(ctx, { studentId: student.id }) : Promise.resolve(null),
    canAttendance ? attendanceReport(ctx, { from, to, studentId: student.id }) : Promise.resolve(null),
    canResults ? studentResultsTrend(ctx, student.id) : Promise.resolve(null),
    canFeedback ? listStudentFeedback(ctx, student.id) : Promise.resolve(null),
  ])

  const composed = scoreSummary?.students[0]?.composed ?? null

  const attRow = attendance?.rows[0] ?? null
  const counts = attRow
    ? {
        present: attRow.present,
        late: attRow.late,
        halfDay: attRow.halfDay,
        leave: attRow.leave,
        absent: attRow.absent,
      }
    : null
  const slices = counts ? attendanceDonutSlices(counts) : []
  const attPercent = counts ? attendancePercentOf(counts) : null

  const latest = trend?.at(-1) ?? null

  const dueMinor = student.invoices.reduce((sum, i) => sum + i.balanceMinor, 0)
  const canSeeFeeAmounts = ctx.can('fees.view')
  const canSeeFeeStatus = canSeeFeeAmounts || ctx.can('fees.status')
  const currency = ctx.tenant.currency

  const columns = ((): 2 | 3 | 4 => {
    let n = 0
    if (canAttendance) n += 1
    if (canResults) n += 1
    if (canFeedback) n += 1
    if (canSeeFeeStatus) n += 1
    if (n >= 4) return 4
    if (n === 3) return 3
    return 2
  })()

  return (
    <div className="space-y-4">
      <MetricRow columns={columns}>
        {canAttendance ? (
          <Metric
            label="Attendance"
            value={attPercent === null ? 'No data' : `${attPercent}%`}
            sub="this session"
            emphasis={
              attPercent === null
                ? undefined
                : attPercent < 75
                  ? 'danger'
                  : attPercent < 90
                    ? 'warning'
                    : undefined
            }
          />
        ) : null}
        {canResults ? (
          <Metric
            label="Latest marks"
            value={latest ? `${latest.percent}%` : '—'}
            sub={
              latest
                ? `${latest.grade ?? bandMeta(latest.band).label} · ${latest.examName}`
                : 'No published results'
            }
          />
        ) : null}
        {canFeedback ? (
          <Metric
            label="Teacher feedback"
            value={String(feedback?.length ?? 0)}
            sub="shared notes"
          />
        ) : null}
        {canSeeFeeStatus ? (
          <Metric
            label="Fees"
            value={
              canSeeFeeAmounts
                ? formatMoney(dueMinor, currency)
                : dueMinor > 0
                  ? 'Due'
                  : 'Paid'
            }
            sub={
              canSeeFeeAmounts
                ? dueMinor > 0
                  ? 'outstanding'
                  : 'cleared'
                : dueMinor > 0
                  ? 'Payment pending'
                  : 'No dues'
            }
            emphasis={dueMinor > 0 ? 'warning' : undefined}
          />
        ) : null}
      </MetricRow>

      {canScore ? (
        <Card>
          <CardHeader>
            <CardTitle>Health score</CardTitle>
            <span className="text-xs text-ink-subtle">This session</span>
          </CardHeader>
          {composed ? (
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
                <div className="flex flex-col items-center gap-2">
                  <ScoreDial score={composed.score} band={composed.band} />
                  <CoverageNote coverage={composed.coverage} />
                </div>
                <MetricBreakdown composed={composed} />
              </div>
            </CardContent>
          ) : (
            <EmptyState
              title="Not scored yet"
              description="This student isn’t in the current session’s scoring, or nothing has been recorded to score yet."
            />
          )}
        </Card>
      ) : null}

      {canAttendance ? (
        <Card>
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <span className="text-xs text-ink-subtle">This session</span>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-[200px_1fr] sm:items-center">
              <DonutChart
                slices={slices}
                centerValue={attPercent === null ? '—' : `${attPercent}%`}
                centerLabel="attended"
              />
              <ul className="space-y-1.5">
                {slices.length ? (
                  slices.map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="inline-flex items-center gap-2 text-ink-muted">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: s.color }}
                          aria-hidden
                        />
                        {s.label}
                      </span>
                      <span className="tnum font-medium text-ink">{s.value}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-ink-subtle">No attendance recorded this session.</li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canResults ? (
        <Card>
          <CardHeader>
            <CardTitle>Marks trend</CardTitle>
            <span className="text-xs text-ink-subtle">Published exams, oldest first</span>
          </CardHeader>
          {trend && trend.length ? (
            <CardContent>
              <ul className="divide-y divide-[var(--border)]">
                {trend.map((p, i) => (
                  <li key={`${p.examName}-${i}`} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-ink">
                        {p.examName}
                      </span>
                      <span className="shrink-0 text-sm tnum text-ink">
                        {p.percent}%
                        {p.grade ? <span className="text-ink-subtle"> · {p.grade}</span> : null}
                      </span>
                    </div>
                    <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span
                        style={{ width: `${p.percent}%`, background: BAND_COLOUR[p.band] }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          ) : (
            <EmptyState
              title="No published results"
              description="Exam results appear here as a RAG-banded trend once they are published."
            />
          )}
        </Card>
      ) : null}

      {canFeedback ? (
        <Card>
          <CardHeader>
            <CardTitle>Teacher feedback</CardTitle>
            <span className="text-xs text-ink-subtle">Shared with the family</span>
          </CardHeader>
          {feedback && feedback.length ? (
            <CardContent className="py-1">
              <ul className="divide-y divide-[var(--border)]">
                {feedback.map((f) => {
                  const chips = [
                    { label: 'Performance', value: f.performance },
                    { label: 'Participation', value: f.participation },
                    { label: 'Homework', value: f.homework },
                    { label: 'Behaviour', value: f.behaviour },
                  ].filter((c) => c.value)
                  return (
                    <li key={f.id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-ink">{f.teacherName}</span>
                        <span className="shrink-0 text-xs text-ink-subtle">
                          {formatDay(f.createdAt)}
                        </span>
                      </div>
                      {f.subjectName ? (
                        <p className="text-xs text-ink-subtle">{f.subjectName}</p>
                      ) : null}
                      {chips.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {chips.map((c) => (
                            <Badge key={c.label} tone="neutral">
                              {c.label}: {c.value}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {f.strengths ? (
                        <p className="mt-1.5 text-sm text-ink">
                          <span className="text-ink-subtle">Strengths: </span>
                          {f.strengths}
                        </p>
                      ) : null}
                      {f.improvement ? (
                        <p className="mt-1 text-sm text-ink">
                          <span className="text-ink-subtle">To work on: </span>
                          {f.improvement}
                        </p>
                      ) : null}
                      {f.comment ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
                          {f.comment}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          ) : (
            <EmptyState
              title="No shared feedback"
              description="Notes a teacher shares with the family appear here. Private notes never do."
            />
          )}
        </Card>
      ) : null}
    </div>
  )
}
