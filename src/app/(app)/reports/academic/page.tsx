import Link from 'next/link'
import { requireContext } from '@/server/context'
import { academicReport } from '@/server/modules/reports/academic'
import { formatNumber } from '@/lib/utils'
import { formatDay } from '@/lib/dates'
import { Badge, humanizeStatus } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { BarList, Footnote, PercentCell } from '@/components/reports/primitives'
import { ReportShell } from '../report-shell'
import { ExamPicker } from './exam-picker'

export const metadata = { title: 'Exam performance report' }

export default async function AcademicReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('reports.view')
  const params = await searchParams
  const report = await academicReport(ctx, {
    examId: params.examId,
    classLevelId: params.classLevelId,
  })

  const canExport = ctx.can('reports.export')

  if (!report.exam || !report.summary) {
    return (
      <ReportShell report="academic" description="No exam has results yet" canExport={false}>
        <Card>
          <EmptyState
            title="No results to report on"
            description="Once marks are entered and results computed for an exam, this page compares classes, subjects and grades."
          />
        </Card>
      </ReportShell>
    )
  }

  const { exam, summary } = report

  return (
    <ReportShell
      report="academic"
      description={
        <>
          {exam.name} · {humanizeStatus(exam.kind)}
          {exam.startsOn ? ` · from ${formatDay(exam.startsOn)}` : ''} ·{' '}
          {formatNumber(summary.assessed)} results
        </>
      }
      canExport={canExport}
      extraQuery={{ examId: exam.id, classLevelId: params.classLevelId }}
      filters={
        <ExamPicker
          exams={report.exams.map((e) => ({
            id: e.id,
            name: e.name,
            session: e.session.name,
            results: e._count.results,
          }))}
          classes={report.classes}
          examId={exam.id}
          classLevelId={params.classLevelId ?? ''}
        />
      }
    >
      <MetricRow>
        <Metric
          label="Pass rate"
          value={summary.passRate === null ? 'No data' : `${summary.passRate}%`}
          sub={`${formatNumber(summary.passed)} passed · ${formatNumber(summary.failed)} did not`}
          emphasis={summary.passRate !== null && summary.passRate < 80 ? 'warning' : undefined}
        />
        <Metric
          label="Average score"
          value={summary.average === null ? '—' : `${summary.average}%`}
          sub={`Highest ${summary.highest ?? '—'}% · lowest ${summary.lowest ?? '—'}%`}
        />
        <Metric
          label="Students assessed"
          value={formatNumber(summary.assessed)}
          sub={exam.publishedAt ? `Published ${formatDay(exam.publishedAt)}` : 'Not published yet'}
        />
        <Metric
          label="Absent marks"
          value={formatNumber(summary.absentMarks)}
          sub="Papers not sat"
          emphasis={summary.absentMarks > 0 ? 'warning' : undefined}
        />
      </MetricRow>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>By class</CardTitle>
            <span className="text-xs text-ink-subtle">Averages exclude absentees</span>
          </CardHeader>
          {report.byClass.length === 0 ? (
            <EmptyState title="No class breakdown" description="Results are not linked to a current enrolment." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Class</TH>
                    <TH align="right">Students</TH>
                    <TH align="right">Average</TH>
                    <TH align="right">Highest</TH>
                    <TH align="right">Passed</TH>
                    <TH align="right">Pass rate</TH>
                  </tr>
                </THead>
                <TBody>
                  {report.byClass.map((c) => (
                    <TR key={c.id}>
                      <TD className="text-sm text-ink">{c.name}</TD>
                      <TD align="right" className="text-sm tnum">
                        {c.students}
                      </TD>
                      <TD align="right">
                        <PercentCell value={c.average} warnBelow={50} dangerBelow={35} />
                      </TD>
                      <TD align="right" className="text-sm tnum">
                        {c.highest === null ? '—' : `${c.highest}%`}
                      </TD>
                      <TD align="right" className="text-sm tnum">
                        {c.passed}
                      </TD>
                      <TD align="right">
                        <PercentCell value={c.passRate} warnBelow={90} dangerBelow={70} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Grade spread</CardTitle>
          </CardHeader>
          <BarList
            emptyLabel="No grades assigned"
            rows={report.grades.map((g) => ({
              label: g.grade,
              value: g.count,
              display: formatNumber(g.count),
              note: summary.assessed
                ? `${Math.round((g.count / summary.assessed) * 100)}%`
                : undefined,
            }))}
          />
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>By subject</CardTitle>
          <span className="text-xs text-ink-subtle">
            Averages are marks out of the paper&apos;s maximum
          </span>
        </CardHeader>
        {report.bySubject.length === 0 ? (
          <EmptyState title="No marks entered" description="Enter marks against this exam's subjects." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Subject</TH>
                  <TH>Class</TH>
                  <TH align="right">Appeared</TH>
                  <TH align="right">Absent</TH>
                  <TH align="right">Average</TH>
                  <TH align="right">Highest</TH>
                  <TH align="right">Pass rate</TH>
                </tr>
              </THead>
              <TBody>
                {report.bySubject.map((s) => (
                  <TR key={`${s.className}-${s.code}`}>
                    <TD>
                      <span className="block text-sm text-ink">{s.subject}</span>
                      <span className="block text-xs tnum text-ink-subtle">{s.code}</span>
                    </TD>
                    <TD className="text-sm text-ink-muted">{s.className}</TD>
                    <TD align="right" className="text-sm tnum">
                      {s.appeared}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.absent > 0 ? <span className="text-warning">{s.absent}</span> : 0}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.average === null ? '—' : `${s.average} / ${s.maxMarks}`}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.highest === null ? '—' : s.highest}
                    </TD>
                    <TD align="right">
                      <PercentCell value={s.passRate} warnBelow={90} dangerBelow={70} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Highest scores</CardTitle>
            <Badge tone="success">Top 10</Badge>
          </CardHeader>
          <ResultList rows={report.toppers} />
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Did not pass</CardTitle>
            {report.strugglers.length > 0 ? <Badge tone="danger">Needs a plan</Badge> : null}
          </CardHeader>
          <ResultList rows={report.strugglers} emptyLabel="Everyone passed this exam." />
          <Footnote>
            Capped at fifteen students. Export the table for the full list.
          </Footnote>
        </Card>
      </div>
    </ReportShell>
  )
}

function ResultList({
  rows,
  emptyLabel = 'No results yet.',
}: {
  rows: {
    studentId: string
    name: string
    admissionNo: string
    className: string
    percentage: number
    grade: string | null
    totalObtained: number
    totalMax: number
  }[]
  emptyLabel?: string
}) {
  if (rows.length === 0) return <EmptyState title="Nothing to show" description={emptyLabel} />

  return (
    <TableWrap>
      <Table>
        <THead>
          <tr>
            <TH>Student</TH>
            <TH>Class</TH>
            <TH align="right">Marks</TH>
            <TH align="right">Percentage</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.studentId}>
              <TD>
                <Link
                  href={`/students/${r.studentId}`}
                  className="block text-sm text-ink hover:underline"
                >
                  {r.name}
                </Link>
                <span className="block text-xs tnum text-ink-subtle">{r.admissionNo}</span>
              </TD>
              <TD className="text-sm text-ink-muted">{r.className}</TD>
              <TD align="right" className="text-sm tnum">
                {r.totalObtained} / {r.totalMax}
              </TD>
              <TD align="right">
                <span className="text-sm font-medium tnum text-ink">{r.percentage}%</span>
                {r.grade ? (
                  <span className="ml-1.5 text-xs text-ink-subtle">{r.grade}</span>
                ) : null}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  )
}
