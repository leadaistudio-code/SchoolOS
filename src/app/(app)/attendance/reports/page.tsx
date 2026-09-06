import Link from 'next/link'
import { subDays } from 'date-fns'
import { requireContext } from '@/server/context'
import { attendanceReport } from '@/server/modules/attendance/service'
import { getClassTree } from '@/server/modules/academics/service'
import { toDateInput } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { cn } from '@/lib/utils'
import { Metric, MetricRow } from '@/components/ui/metric'
import { ReportFilters } from './filters'

export const metadata = { title: 'Attendance reports' }

export default async function AttendanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('attendance.view')
  const params = await searchParams

  const to = params.to ?? toDateInput(new Date())
  const from = params.from ?? toDateInput(subDays(new Date(), 29))

  const [{ rows, totals }, classes] = await Promise.all([
    attendanceReport(ctx, {
      from,
      to,
      classLevelId: params.classLevelId,
      sectionId: params.sectionId,
    }),
    getClassTree(ctx),
  ])

  const totalMarked =
    (totals.PRESENT ?? 0) + (totals.ABSENT ?? 0) + (totals.LATE ?? 0) + (totals.HALF_DAY ?? 0)
  const attended = (totals.PRESENT ?? 0) + (totals.LATE ?? 0) + (totals.HALF_DAY ?? 0)
  const overall = totalMarked > 0 ? Math.round((attended / totalMarked) * 1000) / 10 : null

  // Below 75% is the threshold most boards use for exam eligibility.
  const atRisk = rows.filter((r) => r.percent !== null && r.percent < 75)

  return (
    <div>
      <PageHeader
        title="Attendance reports"
        description={`${from} to ${to} · ${rows.length} students with recorded attendance`}
      />

      <MetricRow className="mb-4">
        <Metric
          label="Overall attendance"
          value={overall === null ? 'No data' : `${overall}%`}
          sub={`${totalMarked} day-records in range`}
          emphasis={overall !== null && overall < 85 ? 'warning' : undefined}
        />
        <Metric
          label="Below 75%"
          value={String(atRisk.length)}
          sub="At risk of exam ineligibility"
          emphasis={atRisk.length > 0 ? 'danger' : undefined}
        />
        <Metric
          label="Absences"
          value={String(totals.ABSENT ?? 0)}
          sub={`${totals.LATE ?? 0} late arrivals`}
        />
        <Metric label="Approved leave" value={String(totals.LEAVE ?? 0)} sub="Days recorded as leave" />
      </MetricRow>

      <Card className="overflow-hidden">
        <ReportFilters classes={classes} from={from} to={to} />

        {rows.length === 0 ? (
          <EmptyState
            title="No attendance in this range"
            description="Try a wider date range, or mark attendance first."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Class</TH>
                  <TH align="right">Present</TH>
                  <TH align="right">Absent</TH>
                  <TH align="right">Late</TH>
                  <TH align="right">Leave</TH>
                  <TH align="right">Attendance</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.studentId}>
                    <TD>
                      <Link
                        href={`/attendance/reports/${r.studentId}?from=${from}&to=${to}`}
                        className="block text-sm font-medium text-ink hover:underline"
                      >
                        {r.name}
                      </Link>
                      <span className="block text-xs text-ink-subtle tnum">{r.admissionNo}</span>
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {r.className ? `${r.className} ${r.sectionName ?? ''}` : '—'}
                    </TD>
                    <TD align="right" className="text-sm">
                      {r.present}
                    </TD>
                    <TD align="right" className="text-sm">
                      {r.absent}
                    </TD>
                    <TD align="right" className="text-sm">
                      {r.late}
                    </TD>
                    <TD align="right" className="text-sm">
                      {r.leave}
                    </TD>
                    <TD align="right">
                      {r.percent === null ? (
                        <span className="text-sm text-ink-subtle">—</span>
                      ) : (
                        <Link
                          href={`/attendance/reports/${r.studentId}?from=${from}&to=${to}`}
                          className={cn(
                            'text-sm font-medium tabular-nums hover:underline',
                            r.percent < 75
                              ? 'text-[var(--danger)]'
                              : r.percent < 85
                                ? 'text-[var(--warning)]'
                                : 'text-ink',
                          )}
                        >
                          {r.percent}%
                        </Link>
                      )}
                    </TD>
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
