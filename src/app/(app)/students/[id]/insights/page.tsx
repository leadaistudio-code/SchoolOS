import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getStudent } from '@/server/modules/students/service'
import { scoreStudents, SEVERITY_PENALTY, DEFAULT_SEVERITY_PENALTY } from '@/server/modules/score/service'
import { listStudentFeedback } from '@/server/modules/students/performance'
import {
  STUDENT_INSIGHTS,
  SCORE_METRIC_TAB,
  insightWindow,
  studentAttendanceDays,
  studentBoarding,
  studentConduct,
  studentExamMarks,
  studentHomework,
  studentInvoices,
  studentLoans,
  studentTeams,
  type StudentInsight,
} from '@/server/modules/students/insights'
import { formatDay } from '@/lib/dates'
import { formatMoney, fullName } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { LinkTabs } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Formula, InputGrid, type InputCell } from '@/components/insights/formula'

export const metadata = { title: 'Student 360 · how each number is worked out' }

const LABEL: Record<StudentInsight, string> = {
  score: 'Health score',
  attendance: 'Attendance',
  punctuality: 'Punctuality',
  academics: 'Marks',
  homework: 'Homework',
  fees: 'Fees',
  behaviour: 'Behaviour',
  transport: 'Transport',
  library: 'Library',
  sports: 'Sports',
  feedback: 'Feedback',
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : '—')
const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  PRESENT: 'success',
  LATE: 'warning',
  HALF_DAY: 'warning',
  ABSENT: 'danger',
  LEAVE: 'info',
  HOLIDAY: 'neutral',
}

export default async function StudentInsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ m?: string }>
}) {
  const { id } = await params
  const { m } = await searchParams
  const ctx = await requireContext('students.view')
  const student = await getStudent(ctx, id)
  const window = await insightWindow(ctx)

  const canScore = ctx.can('score.view')
  const allowed: Record<StudentInsight, boolean> = {
    score: canScore,
    attendance: ctx.can('attendance.view'),
    punctuality: ctx.can('attendance.view'),
    academics: ctx.can('results.view'),
    homework: canScore,
    fees: ctx.can('fees.view'),
    behaviour: canScore,
    transport: canScore,
    library: canScore,
    sports: canScore,
    feedback: ctx.can('feedback.view'),
  }
  const tabs = STUDENT_INSIGHTS.filter((t) => allowed[t])
  const active: StudentInsight | undefined = tabs.includes(m as StudentInsight) ? (m as StudentInsight) : tabs[0]
  const href = (t: StudentInsight) => `/students/${id}/insights?m=${t}`

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${fullName(student)} · how each number is worked out`}
        description={`Every Student 360 figure, opened up: the rule, the inputs and the records behind it${
          window ? ` (${window.sessionName}, ${formatDay(window.from)} to ${formatDay(window.to)})` : ''
        }.`}
        breadcrumbs={[
          { label: 'Students', href: '/students' },
          { label: fullName(student), href: `/students/${id}` },
          { label: 'Drill-down' },
        ]}
        actions={<BackButton fallbackHref={`/students/${id}`} />}
      />
      <LinkTabs
        label="Metric"
        items={tabs.map((t) => ({ label: LABEL[t], href: href(t), active: t === active }))}
      />
      {!window || !active ? (
        <Card>
          <EmptyState title="Nothing to show" description="There is no current academic session, or you cannot view these figures." />
        </Card>
      ) : (
        <Section ctx={ctx} studentId={id} metric={active} window={window} href={href} />
      )}
    </div>
  )
}

async function Section({
  ctx,
  studentId,
  metric,
  window,
  href,
}: {
  ctx: Awaited<ReturnType<typeof requireContext>>
  studentId: string
  metric: StudentInsight
  window: NonNullable<Awaited<ReturnType<typeof insightWindow>>>
  href: (t: StudentInsight) => string
}) {
  const currency = ctx.tenant.currency

  if (metric === 'score') {
    const summary = await scoreStudents(ctx, { studentId })
    const composed = summary.students[0]?.composed
    if (!composed || composed.parts.length === 0) {
      return <Card><EmptyState title="Not scored yet" description="Nothing has been recorded to score this session." /></Card>
    }
    return (
      <Card>
        <CardHeader><CardTitle>Health score</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            Score = Σ (metric score × its share of the weighting). Metrics with nothing recorded are left out and
            their weight is shared across the rest.
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
                  const tab = SCORE_METRIC_TAB[p.metric]
                  return (
                    <TR key={p.metric}>
                      <TD>
                        {tab ? (
                          <Link href={href(tab)} className="font-medium text-[var(--brand-600)] hover:underline">{p.label}</Link>
                        ) : (
                          <span className="font-medium">{p.label}</span>
                        )}
                      </TD>
                      <TD className="text-xs text-ink-muted">{p.detail}</TD>
                      <TD align="right" className="tnum">{p.score === null ? '—' : p.score.toFixed(1)}</TD>
                      <TD align="right" className="tnum">{(p.configuredShare * 100).toFixed(0)}%</TD>
                      <TD align="right" className="tnum">{p.score === null ? 'left out' : `${(p.effectiveShare * 100).toFixed(1)}%`}</TD>
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
    const days = await studentAttendanceDays(ctx, studentId, window.sessionId)
    const count = (s: string) => days.filter((d) => d.status === s).length
    const present = count('PRESENT')
    const late = count('LATE')
    const half = count('HALF_DAY')
    const absent = count('ABSENT')
    const leave = count('LEAVE')
    const marked = present + late + half + absent
    const attended = present + late + half
    const credited = present + late + half * 0.5
    const inputs: InputCell[] =
      metric === 'attendance'
        ? [
            { label: 'Present', value: present },
            { label: 'Late (counts as present)', value: late },
            { label: 'Half day (counts ½)', value: half },
            { label: 'Absent', value: absent },
            { label: 'Approved leave (left out)', value: leave },
            { label: 'Attendance', value: pct(credited, marked), strong: true },
          ]
        : [
            { label: 'Days attended', value: attended },
            { label: 'Late arrivals', value: late },
            { label: 'On time', value: attended - late },
            { label: 'Punctuality', value: pct(attended - late, attended), strong: true },
          ]
    const monthly = new Map<string, { present: number; late: number; half: number; absent: number; leave: number }>()
    for (const d of days) {
      const key = formatDay(d.onDate, 'MMM yyyy')
      const row = monthly.get(key) ?? { present: 0, late: 0, half: 0, absent: 0, leave: 0 }
      if (d.status === 'PRESENT') row.present++
      if (d.status === 'LATE') row.late++
      if (d.status === 'HALF_DAY') row.half++
      if (d.status === 'ABSENT') row.absent++
      if (d.status === 'LEAVE') row.leave++
      monthly.set(key, row)
    }
    const exceptions = days.filter((d) => (metric === 'attendance' ? d.status !== 'PRESENT' : d.status === 'LATE'))
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>{metric === 'attendance' ? 'Attendance' : 'Punctuality'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Formula>
              {metric === 'attendance'
                ? `(Present + Late + ½ × Half day) ÷ (Present + Late + Half day + Absent) = (${present} + ${late} + ½ × ${half}) ÷ ${marked} = ${pct(credited, marked)}. Approved leave is left out of both halves.`
                : `(Days attended − Late) ÷ Days attended = (${attended} − ${late}) ÷ ${attended} = ${pct(attended - late, attended)}`}
            </Formula>
            <InputGrid cells={inputs} />
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Month by month</CardTitle></CardHeader>
          <TableWrap>
            <Table>
              <THead><tr><TH>Month</TH><TH align="right">Present</TH><TH align="right">Late</TH><TH align="right">Half day</TH><TH align="right">Absent</TH><TH align="right">Leave</TH><TH align="right">%</TH></tr></THead>
              <TBody>
                {[...monthly.entries()].map(([month, r]) => (
                  <TR key={month}>
                    <TD>{month}</TD>
                    <TD align="right" className="tnum">{r.present}</TD>
                    <TD align="right" className="tnum">{r.late}</TD>
                    <TD align="right" className="tnum">{r.half}</TD>
                    <TD align="right" className="tnum">{r.absent}</TD>
                    <TD align="right" className="tnum">{r.leave}</TD>
                    <TD align="right" className="tnum">
                      {pct(r.present + r.late + r.half * 0.5, r.present + r.late + r.half + r.absent)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{metric === 'attendance' ? 'Days not marked present' : 'Late arrivals'}</CardTitle>
            <span className="text-xs text-ink-subtle">{exceptions.length} days</span>
          </CardHeader>
          {exceptions.length === 0 ? (
            <EmptyState title="None" description="Nothing to list for this session." />
          ) : (
            <TableWrap>
              <Table>
                <THead><tr><TH>Date</TH><TH>Status</TH><TH>Minutes late</TH><TH>Remarks</TH></tr></THead>
                <TBody>
                  {exceptions.map((d) => (
                    <TR key={d.id}>
                      <TD className="whitespace-nowrap">{formatDay(d.onDate, 'EEE d MMM yyyy')}</TD>
                      <TD><Badge tone={STATUS_TONE[d.status] ?? 'neutral'}>{d.status.replace('_', ' ').toLowerCase()}</Badge></TD>
                      <TD className="tnum">{d.minutesLate ?? '—'}</TD>
                      <TD className="text-sm text-ink-muted">{d.remarks ?? ''}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>
    )
  }

  if (metric === 'academics') {
    const exams = await studentExamMarks(ctx, studentId, window.sessionId)
    const mean = exams.length ? exams.reduce((s, e) => s + e.percentage, 0) / exams.length : null
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Marks</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Formula>
              Each exam % = marks obtained ÷ maximum marks across its papers. The health score uses the mean of all
              published exams this session
              {mean !== null ? `: (${exams.map((e) => `${e.percentage.toFixed(1)}`).join(' + ')}) ÷ ${exams.length} = ${mean.toFixed(1)}%` : ''}.
              The 360° tile shows the latest exam.
            </Formula>
          </CardContent>
        </Card>
        {exams.length === 0 ? (
          <Card><EmptyState title="No published results" description="Results appear once an exam is published." /></Card>
        ) : (
          exams.map((e) => (
            <Card key={e.id} className="overflow-hidden">
              <CardHeader>
                <CardTitle>{e.exam.name}</CardTitle>
                <span className="text-sm tnum text-ink">
                  {e.totalObtained} / {e.totalMax} = {e.percentage.toFixed(1)}%
                  {e.grade ? ` · ${e.grade}` : ''}
                  {e.rankInClass ? ` · rank ${e.rankInClass}` : ''}
                  {!e.isPass ? ' · not passed' : ''}
                </span>
              </CardHeader>
              <TableWrap>
                <Table>
                  <THead><tr><TH>Subject</TH><TH align="right">Written</TH><TH align="right">Oral</TH><TH align="right">Internal</TH><TH align="right">Total</TH><TH align="right">Out of</TH><TH align="right">%</TH></tr></THead>
                  <TBody>
                    {e.marks.map((mk) => {
                      const oral = mk.oralMarks ?? 0
                      const internal = mk.internalMarks ?? 0
                      const total = mk.marksObtained ?? 0
                      return (
                        <TR key={mk.id}>
                          <TD className="font-medium">{mk.examSubject.classSubject.subject.name}</TD>
                          {mk.isAbsent || mk.notApplicable ? (
                            <TD colSpan={6} className="text-ink-subtle">{mk.isAbsent ? 'Absent' : 'Not taken (left out)'}</TD>
                          ) : (
                            <>
                              <TD align="right" className="tnum">{Math.max(0, total - oral - internal)}</TD>
                              <TD align="right" className="tnum">{mk.oralMarks ?? '—'}</TD>
                              <TD align="right" className="tnum">{mk.internalMarks ?? '—'}</TD>
                              <TD align="right" className="tnum font-medium">{total}</TD>
                              <TD align="right" className="tnum">{mk.examSubject.maxMarks}</TD>
                              <TD align="right" className="tnum">{pct(total, mk.examSubject.maxMarks)}</TD>
                            </>
                          )}
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              </TableWrap>
            </Card>
          ))
        )}
      </div>
    )
  }

  if (metric === 'homework') {
    const rows = await studentHomework(ctx, studentId, window.from, window.to)
    const onTime = rows.filter((r) => r.status === 'SUBMITTED' || r.status === 'REVIEWED').length
    const partial = rows.filter((r) => r.status === 'LATE' || r.status === 'REDO').length
    return (
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Homework</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            (On time + ½ × Late or redo) ÷ Homework set = ({onTime} + ½ × {partial}) ÷ {rows.length} ={' '}
            {pct(onTime + partial * 0.5, rows.length)}
          </Formula>
        </CardContent>
        <TableWrap>
          <Table>
            <THead><tr><TH>Due</TH><TH>Subject</TH><TH>Homework</TH><TH>Status</TH><TH align="right">Score</TH></tr></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">{formatDay(r.homework.dueOn)}</TD>
                  <TD>{r.homework.classSubject.subject.name}</TD>
                  <TD className="text-sm">{r.homework.title}</TD>
                  <TD><Badge tone={r.status === 'PENDING' ? 'danger' : r.status === 'LATE' || r.status === 'REDO' ? 'warning' : 'success'}>{r.status.toLowerCase()}</Badge></TD>
                  <TD align="right" className="tnum">{r.score ?? '—'}{r.homework.maxScore ? ` / ${r.homework.maxScore}` : ''}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </Card>
    )
  }

  if (metric === 'fees') {
    const invoices = await studentInvoices(ctx, studentId, window.sessionId)
    const today = new Date()
    const overdue = invoices.filter((i) => i.balanceMinor > 0 && i.dueOn < today)
    const outstanding = invoices.reduce((s, i) => s + i.balanceMinor, 0)
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Fees</CardTitle>
          {ctx.can('fees.accounts') ? (
            <Link href={`/finance/students/${studentId}`} className="text-sm font-medium text-[var(--brand-600)] hover:underline">Open fee ledger</Link>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            Outstanding = Σ invoice balance = {formatMoney(outstanding, currency)}. Fee timeliness = invoices not past
            due ÷ invoices issued = ({invoices.length} − {overdue.length}) ÷ {invoices.length} ={' '}
            {pct(invoices.length - overdue.length, invoices.length)}
          </Formula>
        </CardContent>
        <TableWrap>
          <Table>
            <THead><tr><TH>Invoice</TH><TH>Due</TH><TH align="right">Billed</TH><TH align="right">Paid</TH><TH align="right">Balance</TH><TH>Standing</TH></tr></THead>
            <TBody>
              {invoices.map((i) => (
                <TR key={i.id}>
                  <TD><span className="font-medium">{i.title}</span><span className="block text-xs text-ink-subtle tnum">{i.number}</span></TD>
                  <TD className="whitespace-nowrap">{formatDay(i.dueOn)}</TD>
                  <TD align="right" className="tnum">{formatMoney(i.totalMinor, currency)}</TD>
                  <TD align="right" className="tnum">{formatMoney(i.paidMinor, currency)}</TD>
                  <TD align="right" className="tnum">{formatMoney(i.balanceMinor, currency)}</TD>
                  <TD>
                    {i.balanceMinor <= 0 ? <Badge tone="success">paid</Badge> : i.dueOn < today ? <Badge tone="danger">overdue</Badge> : <Badge tone="neutral">not yet due</Badge>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </Card>
    )
  }

  if (metric === 'behaviour') {
    const { records, schoolRecordsConduct } = await studentConduct(ctx, studentId, window.from, window.to)
    const penaltyOf = (s: string) => SEVERITY_PENALTY[s.toUpperCase()] ?? DEFAULT_SEVERITY_PENALTY
    const penalty = records.reduce((s, r) => s + penaltyOf(r.severity), 0)
    return (
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Behaviour</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            {schoolRecordsConduct
              ? `100 − penalties (minor ${SEVERITY_PENALTY.MINOR}, major ${SEVERITY_PENALTY.MAJOR}, severe ${SEVERITY_PENALTY.SEVERE}, other ${DEFAULT_SEVERITY_PENALTY}) = 100 − ${penalty} = ${Math.max(0, 100 - penalty)}`
              : 'This school has not recorded any conduct yet, so behaviour is not scored.'}
          </Formula>
        </CardContent>
        {records.length ? (
          <TableWrap>
            <Table>
              <THead><tr><TH>Date</TH><TH>Category</TH><TH>Severity</TH><TH align="right">Penalty</TH><TH>Notes</TH></tr></THead>
              <TBody>
                {records.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{formatDay(r.occurredOn)}</TD>
                    <TD>{r.category}</TD>
                    <TD>{r.severity.toLowerCase()}</TD>
                    <TD align="right" className="tnum">−{penaltyOf(r.severity)}</TD>
                    <TD className="text-sm text-ink-muted">{r.notes}{r.actionTaken ? ` · Action: ${r.actionTaken}` : ''}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        ) : (
          <EmptyState title="Nothing on record" description="No conduct records this session." />
        )}
      </Card>
    )
  }

  if (metric === 'transport') {
    const logs = await studentBoarding(ctx, studentId, window.from, window.to)
    const boarded = logs.filter((l) => l.event === 'BOARDED').length
    return (
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Transport</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Formula>Boarded ÷ recorded trips = {boarded} ÷ {logs.length} = {pct(boarded, logs.length)}</Formula>
        </CardContent>
        <TableWrap>
          <Table>
            <THead><tr><TH>When</TH><TH>Event</TH><TH>Stop</TH></tr></THead>
            <TBody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap">{formatDay(l.occurredAt, 'd MMM yyyy, HH:mm')}</TD>
                  <TD><Badge tone={l.event === 'BOARDED' ? 'success' : 'danger'}>{l.event === 'BOARDED' ? 'boarded' : 'missed bus'}</Badge></TD>
                  <TD>{l.stop?.name ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </Card>
    )
  }

  if (metric === 'library') {
    const loans = await studentLoans(ctx, studentId, window.from)
    const closed = loans.filter((l) => l.returnedOn || l.status === 'OVERDUE')
    const onTime = closed.filter((l) => l.returnedOn && l.returnedOn <= l.dueOn).length
    return (
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Library</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            Returned on time ÷ (returned + overdue) = {onTime} ÷ {closed.length} = {pct(onTime, closed.length)}. Books
            still out and not yet due are not counted.
          </Formula>
        </CardContent>
        <TableWrap>
          <Table>
            <THead><tr><TH>Book</TH><TH>Issued</TH><TH>Due</TH><TH>Returned</TH><TH>Counts as</TH></tr></THead>
            <TBody>
              {loans.map((l) => (
                <TR key={l.id}>
                  <TD className="font-medium">{l.book.title}</TD>
                  <TD className="whitespace-nowrap">{formatDay(l.issuedOn)}</TD>
                  <TD className="whitespace-nowrap">{formatDay(l.dueOn)}</TD>
                  <TD className="whitespace-nowrap">{l.returnedOn ? formatDay(l.returnedOn) : '—'}</TD>
                  <TD>
                    {l.returnedOn
                      ? l.returnedOn <= l.dueOn ? <Badge tone="success">on time</Badge> : <Badge tone="warning">late</Badge>
                      : l.status === 'OVERDUE' ? <Badge tone="danger">overdue</Badge> : <Badge tone="neutral">not counted yet</Badge>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </Card>
    )
  }

  if (metric === 'sports') {
    const teams = await studentTeams(ctx, studentId)
    const captain = teams.some((t) => t.isCaptain)
    return (
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Sports</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Formula>
            Captain of any team = 100; otherwise 70 + 10 per team, up to 100. Not on a team = not scored.{' '}
            {teams.length ? `Here: ${captain ? '100 (captain)' : `70 + 10 × ${teams.length} = ${Math.min(100, 70 + teams.length * 10)}`}` : ''}
          </Formula>
        </CardContent>
        <TableWrap>
          <Table>
            <THead><tr><TH>Sport</TH><TH>Team</TH><TH>Position</TH><TH>Captain</TH></tr></THead>
            <TBody>
              {teams.map((t) => (
                <TR key={t.id}>
                  <TD>{t.team.sport.name}</TD>
                  <TD>{t.team.name}</TD>
                  <TD>{t.position ?? '—'}</TD>
                  <TD>{t.isCaptain ? 'Yes' : 'No'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </Card>
    )
  }

  const feedback = await listStudentFeedback(ctx, studentId)
  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>Teacher feedback</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Formula>Count of notes teachers shared with the family = {feedback.length}. Private notes are not counted.</Formula>
      </CardContent>
      <TableWrap>
        <Table>
          <THead><tr><TH>Date</TH><TH>Teacher</TH><TH>Subject</TH><TH>Ratings</TH><TH>Note</TH></tr></THead>
          <TBody>
            {feedback.map((f) => (
              <TR key={f.id}>
                <TD className="whitespace-nowrap">{formatDay(f.createdAt)}</TD>
                <TD>{f.teacherName}</TD>
                <TD>{f.subjectName ?? '—'}</TD>
                <TD className="text-xs">
                  {[
                    f.performance && `Performance ${f.performance}`,
                    f.participation && `Participation ${f.participation}`,
                    f.homework && `Homework ${f.homework}`,
                    f.behaviour && `Behaviour ${f.behaviour}`,
                  ].filter(Boolean).join(' · ') || '—'}
                </TD>
                <TD className="text-sm text-ink-muted">{[f.strengths, f.improvement, f.comment].filter(Boolean).join(' · ')}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </Card>
  )
}
