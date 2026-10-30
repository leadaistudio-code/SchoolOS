import Link from 'next/link'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { getStaff } from '@/server/modules/people/service'
import { scoreStaff } from '@/server/modules/score/staff'
import { staffFeedback, staffPerformance } from '@/server/modules/staff/performance'
import { listAppraisals } from '@/server/modules/staff/appraisals'
import {
  STAFF_INSIGHTS,
  STAFF_SCORE_METRIC_TAB,
  RECENT_DAYS,
  staffWindow,
  staffAttendanceDays,
  staffClasswork,
  staffHomework,
  staffMarksEntered,
  staffTimetable,
  type StaffInsight,
  type StaffWindow,
} from '@/server/modules/staff/insights'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { LinkTabs } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, humanizeStatus, type BadgeTone } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Formula, InputGrid } from '@/components/insights/formula'

export const metadata = { title: 'Staff 360 · in detail' }

const LABEL: Record<StaffInsight, string> = {
  score: 'Health score',
  attendance: 'Attendance',
  punctuality: 'Punctuality',
  load: 'Timetable',
  classwork: 'Lessons logged',
  homework: 'Homework & marking',
  marks: 'Marks entered',
  syllabus: 'Syllabus',
  appraisal: 'Appraisal',
  feedback: 'Feedback',
}

/** Tabs whose figures depend on a date window. */
const WINDOWED = new Set<StaffInsight>(['attendance', 'punctuality', 'classwork', 'homework'])

const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const STATUS_TONE: Record<string, BadgeTone> = {
  PRESENT: 'success',
  LATE: 'warning',
  HALF_DAY: 'warning',
  ABSENT: 'danger',
  LEAVE: 'info',
  HOLIDAY: 'neutral',
}
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : '—')
const time = (d: Date | null) => (d ? format(d, 'HH:mm') : '—')

type Ctx = Awaited<ReturnType<typeof requireContext>>

export default async function StaffInsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ m?: string; w?: string }>
}) {
  const { id } = await params
  const { m, w } = await searchParams
  const ctx = await requireContext('staff.view')
  const staff = await getStaff(ctx, id)
  const name = `${staff.firstName} ${staff.lastName}`.trim()
  const isTeacher = staff.staffType === 'TEACHING'

  const allowed: Record<StaffInsight, boolean> = {
    score: ctx.can('score.view'),
    attendance: true,
    punctuality: true,
    load: isTeacher,
    classwork: isTeacher,
    homework: isTeacher,
    marks: isTeacher,
    syllabus: isTeacher,
    appraisal: true,
    feedback: isTeacher,
  }
  const tabs = STAFF_INSIGHTS.filter((t) => allowed[t])
  const active = tabs.includes(m as StaffInsight) ? (m as StaffInsight) : tabs[0]!
  const windowKind = w === 'session' ? 'session' : 'recent'
  const window = await staffWindow(ctx, windowKind)
  const href = (t: StaffInsight, wk: 'recent' | 'session' = windowKind) =>
    `/staff/${id}/insights?m=${t}${wk === 'session' ? '&w=session' : ''}`

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${name} · in detail`}
        description="Every Staff 360 figure opened up: the rule it follows, the numbers that go into it and the records behind them."
        breadcrumbs={[
          { label: 'Teachers & staff', href: '/staff' },
          { label: name, href: `/staff/${id}` },
          { label: 'In detail' },
        ]}
        actions={<BackButton fallbackHref={`/staff/${id}`} />}
      />
      <LinkTabs
        label="Metric"
        items={tabs.map((t) => ({ label: LABEL[t], href: href(t), active: t === active }))}
      />
      {WINDOWED.has(active) ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-subtle">Period:</span>
          <Link
            href={href(active, 'recent')}
            className={windowKind === 'recent' ? 'font-semibold text-ink' : 'text-[var(--brand-600)] hover:underline'}
          >
            Last {RECENT_DAYS} days (as on the 360°)
          </Link>
          <span className="text-ink-subtle">·</span>
          <Link
            href={href(active, 'session')}
            className={windowKind === 'session' ? 'font-semibold text-ink' : 'text-[var(--brand-600)] hover:underline'}
          >
            This session (as in the health score)
          </Link>
          <span className="text-xs text-ink-subtle">
            {formatDay(window.from)} to {formatDay(window.to)}
          </span>
        </div>
      ) : null}
      <Section ctx={ctx} staffId={id} metric={active} window={window} href={href} />
    </div>
  )
}

async function Section({
  ctx,
  staffId,
  metric,
  window,
  href,
}: {
  ctx: Ctx
  staffId: string
  metric: StaffInsight
  window: StaffWindow
  href: (t: StaffInsight, wk?: 'recent' | 'session') => string
}) {
  if (metric === 'score') {
    const summary = await scoreStaff(ctx, { staffId })
    const composed = summary.staff[0]?.composed
    if (!composed || composed.parts.length === 0) {
      return (
        <Card>
          <EmptyState title="Not scored yet" description="Nothing has been recorded this session to build a score from." />
        </Card>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Health score</CardTitle>
          <span className="text-xs text-ink-subtle">Current session</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            Score = Σ (metric score × its share of the weighting). A metric with nothing recorded is left out and its
            weight is shared across the rest. Click a metric to see the records behind it.
          </Formula>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Metric</TH>
                  <TH>Evidence</TH>
                  <TH align="right">Score</TH>
                  <TH align="right">Weight</TH>
                  <TH align="right">Counted at</TH>
                  <TH align="right">Adds</TH>
                </tr>
              </THead>
              <TBody>
                {composed.parts.map((p) => {
                  const tab = STAFF_SCORE_METRIC_TAB[p.metric]
                  return (
                    <TR key={p.metric}>
                      <TD>
                        {tab ? (
                          <Link href={href(tab, 'session')} className="font-medium text-[var(--brand-600)] hover:underline">
                            {p.label}
                          </Link>
                        ) : (
                          <span className="font-medium">{p.label}</span>
                        )}
                      </TD>
                      <TD className="text-xs text-ink-muted">{p.detail}</TD>
                      <TD align="right" className="tnum">{p.score === null ? '—' : p.score.toFixed(1)}</TD>
                      <TD align="right" className="tnum">{(p.configuredShare * 100).toFixed(0)}%</TD>
                      <TD align="right" className="tnum">
                        {p.score === null ? 'left out' : `${(p.effectiveShare * 100).toFixed(1)}%`}
                      </TD>
                      <TD align="right" className="tnum font-medium">{p.score === null ? '—' : p.contribution.toFixed(1)}</TD>
                    </TR>
                  )
                })}
                <TR>
                  <TD className="font-semibold" colSpan={5}>Total</TD>
                  <TD align="right" className="tnum font-semibold">{composed.score?.toFixed(1) ?? '—'}</TD>
                </TR>
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    )
  }

  if (metric === 'attendance' || metric === 'punctuality') {
    const { rows, missing } = await staffAttendanceDays(ctx, staffId, window)
    const count = (s: string) => rows.filter((r) => r.status === s).length
    const present = count('PRESENT')
    const late = count('LATE')
    const half = count('HALF_DAY')
    const absent = count('ABSENT')
    const leave = count('LEAVE')
    const counted = present + late + half + absent
    const attended = present + late + half
    const credited = present + late + half * 0.5
    const shown = metric === 'punctuality' ? rows.filter((r) => r.status === 'LATE' || r.checkInAt) : rows

    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{metric === 'attendance' ? 'Attendance' : 'Punctuality'}</CardTitle>
          <span className="text-xs text-ink-subtle">{window.label}</span>
        </CardHeader>
        <CardContent className="space-y-4">
          {metric === 'attendance' ? (
            <Formula>
              Attendance = (present + late + ½ × half days) ÷ (present + late + half days + absent) = ({present} + {late} +
              ½ × {half}) ÷ {counted} = <strong>{pct(credited, counted)}</strong>. Approved leave ({leave}) is left out of
              both sides rather than counted against.
            </Formula>
          ) : (
            <Formula>
              Punctuality = days on time ÷ days attended = ({attended} − {late} late) ÷ {attended} ={' '}
              <strong>{pct(attended - late, attended)}</strong>.
            </Formula>
          )}
          <InputGrid
            cells={[
              { label: 'Present', value: present },
              { label: 'Late', value: late },
              { label: 'Half day', value: half },
              { label: 'Absent', value: absent },
              { label: 'On leave', value: leave },
              {
                label: metric === 'attendance' ? 'Attendance' : 'Punctuality',
                value: metric === 'attendance' ? pct(credited, counted) : pct(attended - late, attended),
                strong: true,
              },
            ]}
          />
          {missing.length > 0 && metric === 'attendance' ? (
            <p className="text-xs text-ink-subtle">
              Not marked on {missing.length} day{missing.length === 1 ? '' : 's'} the register ran (
              {missing.slice(0, 8).map((d) => formatDay(d)).join(', ')}
              {missing.length > 8 ? '…' : ''}). Those days are left out, not counted absent.
            </p>
          ) : null}
        </CardContent>
        {shown.length === 0 ? (
          <EmptyState title="No days recorded" description="Nothing has been marked for this person in this period." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH>In</TH>
                  <TH>Out</TH>
                  <TH>How marked</TH>
                  <TH>Note</TH>
                </tr>
              </THead>
              <TBody>
                {shown.map((r) => (
                  <TR key={r.id}>
                    <TD className="tnum">{formatDay(r.onDate)}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{humanizeStatus(r.status)}</Badge>
                    </TD>
                    <TD className="tnum">{time(r.checkInAt)}</TD>
                    <TD className="tnum">{time(r.checkOutAt)}</TD>
                    <TD className="text-xs text-ink-muted">
                      {humanizeStatus(r.source)}
                      {r.insideGeofence === false ? ' · outside campus' : ''}
                    </TD>
                    <TD className="text-xs text-ink-muted">{r.overrideReason ?? r.remarks ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    )
  }

  if (metric === 'load') {
    const slots = await staffTimetable(ctx, staffId)
    const periods = [...new Map(slots.map((s) => [s.period.name, s.period])).values()].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    )
    const days = [...new Set(slots.map((s) => s.dayOfWeek))].sort((a, b) => a - b)
    const cell = (day: number, period: string) => slots.filter((s) => s.dayOfWeek === day && s.period.name === period)
    const classes = new Set(slots.map((s) => `${s.classLevel.name} ${s.section.name}`))
    const subjects = new Set(slots.map((s) => s.classSubject?.subject.name).filter(Boolean))

    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Weekly timetable</CardTitle>
          <span className="text-xs text-ink-subtle">As it stands today</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            Teaching load = every timetable period with this person as the teacher = <strong>{slots.length}</strong>{' '}
            periods a week, across {classes.size} section{classes.size === 1 ? '' : 's'} and {subjects.size} subject
            {subjects.size === 1 ? '' : 's'}.
          </Formula>
          <InputGrid
            cells={[
              ...days.map((d) => ({ label: DAY[d] ?? String(d), value: slots.filter((s) => s.dayOfWeek === d).length })),
              { label: 'Total a week', value: slots.length, strong: true },
            ]}
          />
        </CardContent>
        {slots.length === 0 ? (
          <EmptyState title="No periods assigned" description="This person is not on the timetable." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Period</TH>
                  {days.map((d) => (
                    <TH key={d}>{DAY[d]}</TH>
                  ))}
                </tr>
              </THead>
              <TBody>
                {periods.map((p) => (
                  <TR key={p.name}>
                    <TD>
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-xs text-ink-subtle tnum">
                        {p.startTime}–{p.endTime}
                      </span>
                    </TD>
                    {days.map((d) => (
                      <TD key={d} className="text-xs">
                        {cell(d, p.name).map((s) => (
                          <span key={s.id} className="block">
                            <span className="font-medium text-ink">
                              {s.classLevel.name} {s.section.name}
                            </span>
                            <span className="block text-ink-subtle">
                              {s.classSubject?.subject.name ?? '—'}
                              {s.roomName ? ` · ${s.roomName}` : ''}
                            </span>
                          </span>
                        ))}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    )
  }

  if (metric === 'classwork') {
    const rows = await staffClasswork(ctx, staffId, window)
    const bySubject = new Map<string, number>()
    for (const r of rows) {
      const key = `${r.classLevel.name}${r.section ? ` ${r.section.name}` : ''} · ${r.classSubject.subject.name}`
      bySubject.set(key, (bySubject.get(key) ?? 0) + 1)
    }
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Lessons logged</CardTitle>
          <span className="text-xs text-ink-subtle">{window.label}</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            Lessons logged = classwork entries made by this teacher in {window.label} = <strong>{rows.length}</strong>.
          </Formula>
          {bySubject.size ? (
            <InputGrid
              cells={[...bySubject.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([label, value]) => ({ label, value }))}
            />
          ) : null}
        </CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No lessons logged" description="No classwork has been recorded in this period." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Class</TH>
                  <TH>Subject</TH>
                  <TH>Topic</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="tnum">{formatDay(r.onDate)}</TD>
                    <TD>
                      {r.classLevel.name}
                      {r.section ? ` ${r.section.name}` : ''}
                    </TD>
                    <TD>{r.classSubject.subject.name}</TD>
                    <TD>
                      {r.topic}
                      {r.notes ? <span className="block text-xs text-ink-subtle">{r.notes}</span> : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    )
  }

  if (metric === 'homework') {
    const rows = await staffHomework(ctx, staffId, window)
    const handedIn = rows.reduce((s, r) => s + r.handedIn, 0)
    const marked = rows.reduce((s, r) => s + r.marked, 0)
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Homework set and marked</CardTitle>
          <span className="text-xs text-ink-subtle">{window.label}</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            Marking = submissions reviewed ÷ submissions handed in = {marked} ÷ {handedIn} ={' '}
            <strong>{pct(marked, handedIn)}</strong>. Work a student never handed in is not counted against the teacher.
          </Formula>
          <InputGrid
            cells={[
              { label: 'Homework set', value: rows.length },
              { label: 'Handed in', value: handedIn },
              { label: 'Marked', value: marked },
              { label: 'Waiting to mark', value: handedIn - marked },
              { label: 'Marking rate', value: pct(marked, handedIn), strong: true },
            ]}
          />
        </CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No homework set" description="No homework was assigned in this period." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Set on</TH>
                  <TH>Due</TH>
                  <TH>Class · subject</TH>
                  <TH>Title</TH>
                  <TH align="right">Students</TH>
                  <TH align="right">Handed in</TH>
                  <TH align="right">Marked</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="tnum">{formatDay(r.assignedOn)}</TD>
                    <TD className="tnum">{formatDay(r.dueOn)}</TD>
                    <TD>
                      {r.classLevel.name}
                      {r.section ? ` ${r.section.name}` : ''} · {r.classSubject.subject.name}
                    </TD>
                    <TD>{r.title}</TD>
                    <TD align="right" className="tnum">{r.students}</TD>
                    <TD align="right" className="tnum">{r.handedIn}</TD>
                    <TD align="right" className="tnum">
                      {r.marked}
                      {r.handedIn > r.marked ? (
                        <span className="block text-xs text-warning">{r.handedIn - r.marked} to mark</span>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    )
  }

  if (metric === 'marks') {
    const data = await staffMarksEntered(ctx, staffId)
    const total = data.papers.reduce((s, p) => s + p.count, 0)
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Marks entered</CardTitle>
          <span className="text-xs text-ink-subtle">All time, by this person&apos;s login</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            Marks entered = student marks last saved from this teacher&apos;s login = <strong>{total}</strong> across{' '}
            {data.papers.length} exam paper{data.papers.length === 1 ? '' : 's'}.
          </Formula>
        </CardContent>
        {!data.hasLogin ? (
          <EmptyState title="No portal login" description="Marks are tied to the login that entered them. This person has none." />
        ) : data.papers.length === 0 ? (
          <EmptyState title="No marks entered" description="Nothing has been keyed in from this login yet." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Exam</TH>
                  <TH>Class · subject</TH>
                  <TH>Sheet</TH>
                  <TH align="right">Marks</TH>
                  <TH>Last entry</TH>
                </tr>
              </THead>
              <TBody>
                {data.papers.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/exams/${p.exam.id}`} className="font-medium text-[var(--brand-600)] hover:underline">
                        {p.exam.name}
                      </Link>
                    </TD>
                    <TD>
                      {p.classSubject.classLevel.name} · {p.classSubject.subject.name}
                    </TD>
                    <TD>
                      <Badge tone={p.marksStatus === 'LOCKED' ? 'success' : p.marksStatus === 'SUBMITTED' ? 'info' : 'neutral'}>
                        {humanizeStatus(p.marksStatus)}
                      </Badge>
                    </TD>
                    <TD align="right" className="tnum">{p.count}</TD>
                    <TD className="tnum text-xs text-ink-muted">{p.lastAt ? formatDay(p.lastAt) : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    )
  }

  if (metric === 'syllabus') {
    const perf = await staffPerformance(ctx, staffId)
    const s = perf.syllabus
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Syllabus planning</CardTitle>
          <span className="text-xs text-ink-subtle">Subjects this person teaches</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            Planning depth = chapters and topics entered in the syllabus for every subject this teacher owns ={' '}
            <strong>
              {s.chapters} chapters, {s.topics} topics
            </strong>{' '}
            across {s.plans} plan{s.plans === 1 ? '' : 's'}, {s.published} published.
          </Formula>
        </CardContent>
        {s.bySubject.length === 0 ? (
          <EmptyState title="No syllabus entered" description="None of this person's subjects has a syllabus yet." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Class · subject</TH>
                  <TH align="right">Chapters</TH>
                  <TH align="right">Topics</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {s.bySubject.map((row) => (
                  <TR key={row.id}>
                    <TD>{row.label}</TD>
                    <TD align="right" className="tnum">{row.chapters}</TD>
                    <TD align="right" className="tnum">{row.topics}</TD>
                    <TD>
                      <Badge tone={row.isPublished ? 'success' : 'warning'}>{row.isPublished ? 'published' : 'draft'}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    )
  }

  if (metric === 'appraisal') {
    const appraisals = await listAppraisals(ctx, { staffId })
    const latest = appraisals.find((a) => a.status === 'COMPLETED' && a.overallRating !== null)
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Appraisal</CardTitle>
            <Link href={`/staff/${staffId}?tab=appraisals`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">
              Open appraisals
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {latest ? (
              <Formula>
                Appraisal score = (latest completed rating − 1) ÷ 4 × 100 = ({latest.overallRating!.toFixed(1)} − 1) ÷ 4 × 100
                = <strong>{(((latest.overallRating! - 1) / 4) * 100).toFixed(1)}</strong>. The rating is the mean of the
                competency ratings in {latest.cycleName}; drafts and reviews in progress are not used.
              </Formula>
            ) : (
              <Formula>
                Appraisal score uses the latest completed appraisal. None is completed yet, so this part is left out of the
                health score.
              </Formula>
            )}
          </CardContent>
        </Card>
        {appraisals.length === 0 ? (
          <Card>
            <EmptyState title="No appraisals yet" description="No appraisal cycle has been opened for this person." />
          </Card>
        ) : (
          appraisals.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <CardHeader>
                <CardTitle>{a.cycleName}</CardTitle>
                <div className="flex items-center gap-2">
                  {a === latest ? <Badge tone="brand">used in score</Badge> : null}
                  <Badge tone={a.status === 'COMPLETED' ? 'success' : 'neutral'}>{humanizeStatus(a.status)}</Badge>
                  <span className="text-xs tnum text-ink-subtle">
                    {formatDay(a.periodFrom)} – {formatDay(a.periodTo)}
                  </span>
                </div>
              </CardHeader>
              {a.ratings.length === 0 ? (
                <EmptyState title="Not rated yet" description="No competency has been rated in this cycle." />
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Competency</TH>
                        <TH align="right">Rating</TH>
                        <TH>Comment</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {a.ratings.map((r) => (
                        <TR key={r.id}>
                          <TD>{humanizeStatus(r.competency)}</TD>
                          <TD align="right" className="tnum">{r.rating} / 5</TD>
                          <TD className="text-xs text-ink-muted">{r.comment ?? '—'}</TD>
                        </TR>
                      ))}
                      <TR>
                        <TD className="font-semibold">Overall</TD>
                        <TD align="right" className="tnum font-semibold">
                          {a.overallRating === null ? '—' : `${a.overallRating.toFixed(1)} / 5`}
                        </TD>
                        <TD className="text-xs text-ink-muted">
                          Reviewer: {a.reviewer ? `${a.reviewer.firstName} ${a.reviewer.lastName}` : 'not assigned'}
                        </TD>
                      </TR>
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </Card>
          ))
        )}
      </div>
    )
  }

  // feedback
  const fb = await staffFeedback(ctx, staffId)
  const mean = fb.categories.length
    ? Math.round((fb.categories.reduce((s, c) => s + c.average, 0) / fb.categories.length) * 10) / 10
    : null
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Feedback</CardTitle>
        <span className="text-xs text-ink-subtle">Submitted responses</span>
      </CardHeader>
      <CardContent className="space-y-4">
        {fb.available ? (
          <Formula>
            Feedback = mean of the category averages = ({fb.categories.map((c) => c.average).join(' + ')}) ÷{' '}
            {fb.categories.length} = <strong>{mean ?? '—'} / 5</strong>, from {fb.responseCount} responses.
          </Formula>
        ) : (
          <Formula>
            Ratings are withheld until {fb.minimum} responses are in; there are {fb.responseCount} so far
            {fb.pending > 0 ? ` and ${fb.pending} still outstanding` : ''}.
          </Formula>
        )}
      </CardContent>
      {fb.available && fb.categories.length ? (
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Category</TH>
                <TH align="right">Answers</TH>
                <TH align="right">Average</TH>
              </tr>
            </THead>
            <TBody>
              {fb.categories.map((c) => (
                <TR key={c.name}>
                  <TD>{c.name}</TD>
                  <TD align="right" className="tnum">{c.count}</TD>
                  <TD align="right" className="tnum">{c.average} / 5</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      ) : null}
    </Card>
  )
}
