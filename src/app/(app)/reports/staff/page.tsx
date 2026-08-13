import { requireContext } from '@/server/context'
import { resolveRange } from '@/server/modules/reports/range'
import { staffReport } from '@/server/modules/reports/staff'
import { formatNumber } from '@/lib/utils'
import { formatDay } from '@/lib/dates'
import { humanizeStatus } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState, Notice } from '@/components/ui/states'
import { BarList, Footnote, PercentCell } from '@/components/reports/primitives'
import { ReportShell } from '../report-shell'

export const metadata = { title: 'Staff report' }

export default async function StaffReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('reports.view')
  const params = await searchParams
  const range = resolveRange(params, 29)
  const report = await staffReport(ctx, range)

  const { summary } = report

  return (
    <ReportShell
      report="staff"
      description={`${range.label} · ${formatNumber(summary.headcount)} on the establishment, ${formatNumber(summary.markedDays)} days marked`}
      range={{ from: range.fromInput, to: range.toInput }}
      canExport={ctx.can('reports.export')}
    >
      <MetricRow>
        <Metric
          label="Attendance"
          value={summary.attendanceRate === null ? 'No data' : `${summary.attendanceRate}%`}
          sub={`${formatNumber(summary.marked)} day-records marked`}
          emphasis={
            summary.attendanceRate !== null && summary.attendanceRate < 90 ? 'warning' : undefined
          }
        />
        <Metric
          label="Headcount"
          value={formatNumber(summary.headcount)}
          sub={`${formatNumber(summary.teaching)} teaching · ${formatNumber(summary.nonTeaching)} support`}
        />
        <Metric
          label="Absences"
          value={formatNumber(summary.absent)}
          sub={`${formatNumber(summary.late)} late · ${formatNumber(summary.leave)} on leave`}
        />
        <Metric
          label="Leave awaiting decision"
          value={formatNumber(summary.pendingLeave)}
          sub="Staff requests"
          emphasis={summary.pendingLeave > 0 ? 'warning' : undefined}
          href="/leave"
        />
      </MetricRow>

      {summary.unmarkedStaff > 0 ? (
        <Notice
          tone="info"
          title={`${summary.unmarkedStaff} staff have no attendance record in this range`}
        >
          They are excluded from the rate above rather than counted absent.
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Attendance by member</CardTitle>
          <span className="text-xs text-ink-subtle">
            Percentage is against that person&apos;s own marked days
          </span>
        </CardHeader>
        {report.attendance.length === 0 ? (
          <EmptyState
            title="No staff attendance in this range"
            description="Widen the range, or mark staff attendance first."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Member</TH>
                  <TH>Department</TH>
                  <TH align="right">Present</TH>
                  <TH align="right">Absent</TH>
                  <TH align="right">Late</TH>
                  <TH align="right">Leave</TH>
                  <TH align="right">Marked</TH>
                  <TH align="right">Attendance</TH>
                </tr>
              </THead>
              <TBody>
                {report.attendance.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <span className="block text-sm text-ink">{s.name}</span>
                      <span className="block text-xs tnum text-ink-subtle">
                        {s.employeeCode}
                        {s.designation ? ` · ${s.designation}` : ''}
                      </span>
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {s.department || humanizeStatus(s.staffType)}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.present}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.absent}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.late}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.leave}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {s.days}
                    </TD>
                    <TD align="right">
                      <PercentCell value={s.percent} warnBelow={90} dangerBelow={80} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Footnote>
          Late arrivals and half-days count as attended; only a recorded absence reduces the
          percentage.
        </Footnote>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Leave taken</CardTitle>
            <span className="text-xs text-ink-subtle">Approved days</span>
          </CardHeader>
          <BarList
            tone="info"
            emptyLabel="No staff leave overlaps this range"
            rows={report.leaveByType.map((l) => ({
              label: l.name,
              value: l.days,
              display: `${formatNumber(l.days)} days`,
              note: `${l.requests} req`,
            }))}
          />
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Headcount by department</CardTitle>
          </CardHeader>
          <BarList
            emptyLabel="No departments recorded"
            rows={report.byDepartment.map((d) => ({
              label: d.department,
              value: d.count,
              display: formatNumber(d.count),
            }))}
          />
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Lowest attendance</CardTitle>
            <span className="text-xs text-ink-subtle">Five or more marked days</span>
          </CardHeader>
          {report.lowestAttendance.length === 0 ? (
            <EmptyState title="Nothing to flag" description="Not enough marked days to compare." />
          ) : (
            <BarList
              tone="warning"
              rows={report.lowestAttendance.map((s) => ({
                label: s.name,
                value: s.percent ?? 0,
                display: `${s.percent}%`,
                note: `${s.days} days`,
              }))}
            />
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Longest serving</CardTitle>
          <span className="text-xs text-ink-subtle">By recorded joining date</span>
        </CardHeader>
        {report.longestServing.length === 0 ? (
          <EmptyState
            title="No joining dates recorded"
            description="Add joining dates on staff records to see service history."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Member</TH>
                  <TH>Designation</TH>
                  <TH>Department</TH>
                  <TH align="right">Joined</TH>
                </tr>
              </THead>
              <TBody>
                {report.longestServing.map((s) => (
                  <TR key={s.id}>
                    <TD className="text-sm text-ink">
                      {s.firstName} {s.lastName}
                    </TD>
                    <TD className="text-sm text-ink-muted">{s.designation ?? '—'}</TD>
                    <TD className="text-sm text-ink-muted">{s.department ?? '—'}</TD>
                    <TD align="right" className="text-sm tnum">
                      {s.joinedOn ? formatDay(s.joinedOn) : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </ReportShell>
  )
}
