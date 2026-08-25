import type { AppContext } from '@/server/context'
import { formatDay } from '@/lib/dates'
import { formatNumber } from '@/lib/utils'
import { bandMeta } from '@/lib/score'
import { attendanceDonutSlices, attendancePercentOf } from '@/lib/three-sixty'
import { scoreStaff } from '@/server/modules/score/staff'
import { staffPerformance, staffFeedback } from '@/server/modules/staff/performance'
import { listTeacherReadiness } from '@/server/modules/teacher-refresh/service'
import type { getStaff } from '@/server/modules/people/service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { ScoreDial, CoverageNote, MetricBreakdown } from '@/app/(app)/score/score-ui'
import { DonutChart } from '@/components/dashboard/charts'
import { BarList } from '@/components/reports/primitives'

type StaffRecord = Awaited<ReturnType<typeof getStaff>>

/**
 * One staff member, at a glance — the internal counterpart of the student 360°.
 *
 * This view is personnel data. It lives under `/staff/[id]` behind `staff.view`,
 * which parents and students do not hold, so nothing here reaches a family. The
 * health score and the readiness section are gated further still, and the whole
 * thing is framed to support rather than to rank: attendance and teaching load
 * are facts, the readiness labels are supportive ("Ready", "Refresh
 * recommended"), and a raw refresh-assessment percentage is never shown. No
 * pass/fail, no leaderboard, no employment verdict.
 */
export async function Staff360({
  ctx,
  staff,
}: {
  ctx: AppContext
  staff: StaffRecord
}) {
  const canScore = ctx.can('score.view')
  const isTeacher = staff.staffType === 'TEACHING'
  // Readiness is professional-development data. It throws for non-teaching staff,
  // so the type guard has to hold before the call, not just the permission.
  const canReadiness = ctx.can('teacher_refresh.view_department') && isTeacher

  const [scoreSummary, performance, feedback, readiness] = await Promise.all([
    canScore ? scoreStaff(ctx, { staffId: staff.id }) : Promise.resolve(null),
    staffPerformance(ctx, staff.id),
    staffFeedback(ctx, staff.id),
    canReadiness ? listTeacherReadiness(ctx, staff.id) : Promise.resolve(null),
  ])

  const composed = scoreSummary?.staff[0]?.composed ?? null

  const a = performance.attendance
  const counts = {
    present: a.present,
    late: a.late,
    halfDay: a.halfDay,
    leave: a.leave,
    absent: a.absent,
  }
  const slices = attendanceDonutSlices(counts)
  const attPercent = attendancePercentOf(counts)

  const fbAvg =
    feedback.available && feedback.categories.length
      ? Math.round(
          (feedback.categories.reduce((sum, c) => sum + c.average, 0) / feedback.categories.length) *
            10,
        ) / 10
      : null

  const cells = [
    canScore ? (
      <Metric
        key="score"
        label="Health score"
        value={composed?.score != null ? composed.score.toFixed(0) : '—'}
        sub={composed?.band ? bandMeta(composed.band).label : 'not scored'}
      />
    ) : null,
    <Metric
      key="att"
      label="Attendance"
      value={attPercent === null ? 'No data' : `${attPercent}%`}
      sub={`${a.marked} days marked · last ${performance.window.days}`}
      emphasis={
        attPercent === null ? undefined : attPercent < 85 ? 'danger' : attPercent < 92 ? 'warning' : undefined
      }
    />,
    <Metric
      key="load"
      label="Teaching load"
      value={String(performance.teaching.periodsPerWeek)}
      sub={`periods a week · ${performance.teaching.subjects} subjects`}
    />,
    feedback.available ? (
      <Metric
        key="fb"
        label="Feedback"
        value={fbAvg === null ? '—' : `${fbAvg} / 5`}
        sub={`${feedback.responseCount} responses`}
      />
    ) : null,
    canReadiness ? (
      <Metric
        key="ready"
        label="Refresh"
        value={String(readiness?.assessments.length ?? 0)}
        sub="knowledge assessments"
      />
    ) : null,
  ].filter(Boolean)

  const columns: 2 | 3 | 4 = cells.length >= 4 ? 4 : cells.length === 3 ? 3 : 2

  return (
    <div className="space-y-4">
      <MetricRow columns={columns}>{cells}</MetricRow>

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
              description="Nothing has been recorded this session to build a staff score from — attendance and a completed appraisal are what it draws on."
            />
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
          <span className="text-xs text-ink-subtle">Last {performance.window.days} days</span>
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
                <li className="text-sm text-ink-subtle">No attendance marked in this window.</li>
              )}
            </ul>
          </div>
          {a.unmarked > 0 ? (
            <p className="mt-3 text-xs text-ink-subtle">
              {a.unmarked} days the register ran without a row for this person — excluded from the
              percentage rather than counted absent.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teaching activity</CardTitle>
          <span className="text-xs text-ink-subtle">Last {performance.window.days} days</span>
        </CardHeader>
        <CardContent>
          <MetricRow columns={3}>
            <Metric
              label="Lessons logged"
              value={formatNumber(performance.teaching.classworkLogged)}
              sub="classwork entries"
            />
            <Metric
              label="Homework set"
              value={formatNumber(performance.teaching.homeworkSet)}
              sub="tasks assigned"
            />
            <Metric
              label="Marks entered"
              value={formatNumber(performance.teaching.marksEntered)}
              sub={`${performance.teaching.classTeacherOf} as class teacher`}
            />
          </MetricRow>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Feedback</CardTitle>
          <span className="text-xs text-ink-subtle">Mean rating out of five</span>
        </CardHeader>
        {feedback.available ? (
          <BarList
            rows={feedback.categories.map((c) => ({
              label: c.name,
              value: c.average,
              display: `${c.average} / 5`,
              note: `${c.count} answers`,
            }))}
            emptyLabel="No rated categories yet"
          />
        ) : (
          <EmptyState
            title="Not enough responses yet"
            description={`${feedback.responseCount} of the ${feedback.minimum} responses needed. Ratings are withheld below that threshold — with a handful of responses a score says more about who answered than about the teaching.${
              feedback.pending > 0 ? ` ${feedback.pending} requests are still outstanding.` : ''
            }`}
          />
        )}
      </Card>

      {canReadiness ? (
        <Card>
          <CardHeader>
            <CardTitle>Knowledge refresh</CardTitle>
            <span className="text-xs text-ink-subtle">Readiness, not a grade</span>
          </CardHeader>
          {readiness && readiness.assessments.length ? (
            <>
              <ul className="divide-y divide-[var(--border)]">
                {readiness.assessments.map((asmt) => (
                  <li key={asmt.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-ink first-letter:uppercase">
                        {asmt.type.replace(/_/g, ' ').toLowerCase()}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {asmt.questionCount} questions · due {formatDay(new Date(asmt.dueAt))}
                      </p>
                    </div>
                    {asmt.readinessLabel ? (
                      <Badge tone={readinessTone(asmt.readinessLabel)}>{asmt.readinessLabel}</Badge>
                    ) : (
                      <Badge tone="neutral">{asmt.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                    )}
                  </li>
                ))}
              </ul>
              <Notice tone="info" title="What this is for" className="m-4">
                A refresh assessment flags where a short brush-up would help, so support can be
                offered. It is not an exam, not a ranking, and never an input to an employment
                decision.
              </Notice>
            </>
          ) : (
            <EmptyState
              title="No refresh assessments"
              description="Knowledge-refresh assessments assigned to this teacher will appear here with a readiness label."
            />
          )}
        </Card>
      ) : null}
    </div>
  )
}

/**
 * A supportive tone for a readiness label.
 *
 * Tops out at amber — a refresh being recommended is a prompt for support, not
 * a failure, and nothing here is ever coloured danger.
 */
function readinessTone(label: string): BadgeTone {
  const l = label.toLowerCase()
  if (l.includes('ready') || l.includes('strong') || l.includes('confident')) return 'success'
  if (l.includes('refresh') || l.includes('recommend') || l.includes('due') || l.includes('review'))
    return 'warning'
  return 'info'
}
