import Link from 'next/link'
import { requireLms } from '@/server/modules/lms/access'
import { QUIET_AFTER_DAYS, schoolInsights } from '@/server/modules/lms/insights'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Metric } from '@/components/ui/metric'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIst } from '@/lib/ist-clock'

export const metadata = { title: 'Progress · Robotics & AI' }

export default async function LmsInsightsPage() {
  const ctx = await requireLms('lms.view')
  const { totals, courses, classes, weeks, quiet, top } = await schoolInsights(ctx)
  const peak = Math.max(1, ...weeks.map((w) => w.lessons))
  const canTeach = ctx.can('lms.teach')

  return (
    <div className="space-y-4">
      <PageHeader title="Robotics & AI progress" description="How students are moving through courses, live classes, projects and kits." />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Learners" value={String(totals.learners)} sub={`${totals.active7} active this week`} />
        <Metric label="Courses finished" value={String(totals.finished)} sub={`${totals.certificates} certificate${totals.certificates === 1 ? '' : 's'} issued`} />
        <Metric
          label="Quiz average"
          value={totals.quizAverage != null ? `${totals.quizAverage}%` : '—'}
          sub={totals.quizAttempts ? `${totals.quizAttempts} attempts · 90 days` : 'No attempts yet'}
        />
        <Metric
          label="Live attendance"
          value={totals.liveAttendance != null ? `${totals.liveAttendance}%` : '—'}
          sub={totals.liveClasses ? `${totals.liveClasses} classes · 30 days` : 'No classes held yet'}
        />
        <Metric label="Projects to review" value={String(totals.pendingReviews)} sub={totals.pendingReviews && canTeach ? 'Waiting for a teacher' : 'All caught up'} />
        <Metric label="Kits with students" value={String(totals.kitsOut)} sub={totals.kitsLate ? `${totals.kitsLate} overdue` : 'None overdue'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lessons completed each week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-2" role="img" aria-label={`Lessons completed per week: ${weeks.map((w) => w.lessons).join(', ')}`}>
            {weeks.map((w, i) => (
              <div key={w.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-semibold tnum text-ink">{w.lessons || ''}</span>
                <div
                  className={i === weeks.length - 1 ? 'w-full rounded-t-[4px] bg-[var(--brand-500)]' : 'w-full rounded-t-[4px] bg-[var(--brand-100)]'}
                  style={{ height: `${Math.max(w.lessons ? 4 : 1, (w.lessons / peak) * 100)}%` }}
                />
                <span className="text-[11px] text-ink-subtle">{formatIst(new Date(`${w.week}T06:00:00.000Z`), 'd MMM')}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>By course</CardTitle>
        </CardHeader>
        {courses.length === 0 ? (
          <EmptyState title="No courses open yet" description="Open a course to a class from the catalogue to start tracking." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Course</TH>
                  <TH align="right">Started</TH>
                  <TH align="right">Finished</TH>
                  <TH>Average progress</TH>
                  <TH align="right">Gone quiet</TH>
                </tr>
              </THead>
              <TBody>
                {courses.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/lms/courses/${c.id}`} className="font-medium text-ink hover:text-[var(--brand-600)]">
                        {c.title}
                      </Link>
                      <span className="block text-xs text-ink-subtle">
                        {c.lessons} lessons{c.own ? ' · school course' : ''}
                      </span>
                    </TD>
                    <TD align="right">{c.started}</TD>
                    <TD align="right">{c.finished}</TD>
                    <TD className="min-w-40">
                      <div className="flex items-center gap-2">
                        <Progress value={c.averagePercent} tone={c.averagePercent >= 80 ? 'success' : 'brand'} />
                        <span className="w-9 text-right text-xs font-semibold tnum">{c.averagePercent}%</span>
                      </div>
                    </TD>
                    <TD align="right">{c.quiet ? <Badge tone="warning">{c.quiet}</Badge> : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>By class</CardTitle>
        </CardHeader>
        {classes.length === 0 ? (
          <EmptyState title="No learners yet" />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Class</TH>
                  <TH align="right">Students</TH>
                  <TH align="right">Taking a course</TH>
                  <TH align="right">Courses finished</TH>
                  <TH>Average progress</TH>
                </tr>
              </THead>
              <TBody>
                {classes.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium text-ink">{c.name}</TD>
                    <TD align="right">{c.students}</TD>
                    <TD align="right">
                      {c.learners} <span className="text-xs text-ink-subtle">({c.reach}%)</span>
                    </TD>
                    <TD align="right">{c.finished}</TD>
                    <TD className="min-w-40">
                      <div className="flex items-center gap-2">
                        <Progress value={c.averagePercent} tone={c.averagePercent >= 80 ? 'success' : 'brand'} />
                        <span className="w-9 text-right text-xs font-semibold tnum">{c.averagePercent}%</span>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gone quiet</CardTitle>
          </CardHeader>
          {quiet.length === 0 ? (
            <EmptyState title="Everyone is moving" description={`Students who started a course but have done nothing for ${QUIET_AFTER_DAYS} days show here.`} />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {quiet.map((q) => (
                <li key={`${q.studentId}-${q.courseId}`} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{q.name}</p>
                    <p className="truncate text-xs text-ink-subtle">
                      {q.className} · {q.courseTitle} · {q.percent}% done
                    </p>
                  </div>
                  <Badge tone="warning">{q.days} days</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Most lessons this month</CardTitle>
          </CardHeader>
          {top.length === 0 ? (
            <EmptyState title="No lessons completed in the last 30 days" />
          ) : (
            <ol className="divide-y divide-[var(--border)]">
              {top.map((t, i) => (
                <li key={t.studentId} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-5 text-sm font-semibold tnum text-ink-subtle">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                    <p className="truncate text-xs text-ink-subtle">{t.className}</p>
                  </div>
                  <span className="text-sm font-semibold tnum text-ink">{t.lessons}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  )
}
