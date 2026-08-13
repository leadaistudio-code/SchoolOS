import Link from 'next/link'
import { requireContext } from '@/server/context'
import { resolveRange } from '@/server/modules/reports/range'
import { attendanceRollup } from '@/server/modules/reports/attendance'
import { formatNumber } from '@/lib/utils'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState, Notice } from '@/components/ui/states'
import { BarList, ColumnChart, Footnote, PercentCell } from '@/components/reports/primitives'
import { ReportShell } from '../report-shell'

export const metadata = { title: 'Attendance report' }

export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('reports.view')
  const params = await searchParams
  const range = resolveRange(params, 29)
  const report = await attendanceRollup(ctx, range)

  const { summary } = report

  return (
    <ReportShell
      report="attendance"
      description={`${range.label} · ${formatNumber(summary.daysMarked)} days marked, ${formatNumber(summary.marked)} day-records`}
      range={{ from: range.fromInput, to: range.toInput }}
      canExport={ctx.can('reports.export')}
    >
      <MetricRow>
        <Metric
          label="Overall attendance"
          value={summary.overall === null ? 'No data' : `${summary.overall}%`}
          sub={`${formatNumber(summary.attended)} of ${formatNumber(summary.marked)} attended`}
          emphasis={summary.overall !== null && summary.overall < 85 ? 'warning' : undefined}
        />
        <Metric
          label="Below 75%"
          value={formatNumber(summary.chronicCount)}
          sub="At risk of exam ineligibility"
          emphasis={summary.chronicCount > 0 ? 'danger' : undefined}
        />
        <Metric
          label="Absences"
          value={formatNumber(summary.absent)}
          sub={`${formatNumber(summary.late)} late arrivals`}
        />
        <Metric
          label="Approved leave"
          value={formatNumber(summary.leave)}
          sub="Days recorded as leave"
        />
      </MetricRow>

      {summary.unmarkedSections > 0 ? (
        <Notice tone="warning" title={`${summary.unmarkedSections} sections were never marked`}>
          Their students are missing from every figure on this page. The sections are listed at
          the bottom.
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Day by day</CardTitle>
          <span className="text-xs text-ink-subtle">Attendance against records marked</span>
        </CardHeader>
        <div className="pt-3">
          <ColumnChart
            points={report.daily.map((d) => ({
              label: d.day.slice(5),
              values: [d.present, d.absent],
            }))}
            series={[
              { label: 'Attended', color: 'var(--chart-attendance)' },
              { label: 'Absent', color: 'var(--chart-overdue)' },
            ]}
            formatValue={(v) => formatNumber(v)}
          />
        </div>
        <Footnote>
          Half-days count as attended. Days with no register at all do not appear.
        </Footnote>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>By class</CardTitle>
          <span className="text-xs text-ink-subtle">
            Sorted by class, not by rank — a league table is not the point
          </span>
        </CardHeader>
        {report.byClass.length === 0 ? (
          <EmptyState
            title="No attendance in this range"
            description="Widen the range, or mark attendance first."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Class</TH>
                  <TH align="right">Students</TH>
                  <TH align="right">Attended</TH>
                  <TH align="right">Absent</TH>
                  <TH align="right">Late</TH>
                  <TH align="right">Leave</TH>
                  <TH align="right">Attendance</TH>
                </tr>
              </THead>
              <TBody>
                {report.byClass.map((c) => (
                  <TR key={c.id}>
                    <TD className="text-sm text-ink">{c.name}</TD>
                    <TD align="right" className="text-sm tnum">
                      {c.students}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {formatNumber(c.present)}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {formatNumber(c.absent)}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {formatNumber(c.late)}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {formatNumber(c.leave)}
                    </TD>
                    <TD align="right">
                      <PercentCell value={c.percent} warnBelow={85} dangerBelow={75} />
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
          <CardTitle>Below the 75% mark</CardTitle>
          <span className="text-xs text-ink-subtle">
            Students with at least ten marked days in range
          </span>
        </CardHeader>
        {report.chronic.length === 0 ? (
          <EmptyState
            title="Nobody is below 75%"
            description="Every student with a meaningful number of marked days is above the line."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Class</TH>
                  <TH align="right">Attended</TH>
                  <TH align="right">Absent</TH>
                  <TH align="right">Marked</TH>
                  <TH align="right">Attendance</TH>
                </tr>
              </THead>
              <TBody>
                {report.chronic.map((s) => (
                  <TR key={s.studentId}>
                    <TD>
                      <Link
                        href={`/students/${s.studentId}`}
                        className="block text-sm text-ink hover:underline"
                      >
                        {s.name}
                      </Link>
                      <span className="block text-xs tnum text-ink-subtle">{s.admissionNo}</span>
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {s.className} {s.sectionName}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.present}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.absent}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.marked}
                    </TD>
                    <TD align="right">
                      <PercentCell value={s.percent} warnBelow={75} dangerBelow={60} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Footnote>
          Capped at forty students. Export the table for the full list.
        </Footnote>
      </Card>

      {report.unmarkedSections.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Sections with no register</CardTitle>
            <span className="text-xs text-ink-subtle">Nothing marked in this range</span>
          </CardHeader>
          <BarList
            tone="warning"
            rows={report.unmarkedSections.map((s) => ({
              label: `${s.className} ${s.name}`,
              value: 1,
              display: 'Not marked',
            }))}
          />
        </Card>
      ) : null}
    </ReportShell>
  )
}
