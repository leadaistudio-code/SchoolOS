import Link from 'next/link'
import { subDays } from 'date-fns'
import { requireContext } from '@/server/context'
import { attendanceReport } from '@/server/modules/attendance/service'
import { getClassTree } from '@/server/modules/academics/service'
import { getViewSession, withSessionPeriod } from '@/server/view-session'
import { presetRange } from '@/lib/periods'
import { toDateInput } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { SearchBar } from '@/components/search-bar'
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
  const session = await getViewSession(ctx)

  const period = withSessionPeriod(
    {
      preset: params.preset,
      from: params.from,
      to: params.to,
    },
    session,
  )
  const range = period.preset ? presetRange(period.preset) : null
  const to = period.to ?? range?.to ?? toDateInput(new Date())
  const from =
    period.from ?? range?.from ?? session?.range.from ?? toDateInput(subDays(new Date(), 29))

  const [{ rows: allRows, totals }, classes] = await Promise.all([
    attendanceReport(ctx, {
      from,
      to,
      classLevelId: params.classLevelId,
      sectionId: params.sectionId,
      q: params.q,
    }),
    getClassTree(ctx),
  ])

  const q = params.q?.trim().toLowerCase()
  let rows = q
    ? allRows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.admissionNo.toLowerCase().includes(q),
      )
    : allRows

  if (params.risk === 'below_75') {
    rows = rows.filter((r) => r.percent !== null && r.percent < 75)
  } else if (params.risk === 'below_85') {
    rows = rows.filter((r) => r.percent !== null && r.percent < 85)
  }

  if (params.focus === 'absent') {
    rows = rows.filter((r) => r.absent > 0)
  } else if (params.focus === 'late') {
    rows = rows.filter((r) => r.late > 0)
  } else if (params.focus === 'leave') {
    rows = rows.filter((r) => r.leave > 0)
  }

  const totalMarked =
    (totals.PRESENT ?? 0) + (totals.ABSENT ?? 0) + (totals.LATE ?? 0) + (totals.HALF_DAY ?? 0)
  const attended = (totals.PRESENT ?? 0) + (totals.LATE ?? 0) + (totals.HALF_DAY ?? 0)
  const overall = totalMarked > 0 ? Math.round((attended / totalMarked) * 1000) / 10 : null

  const atRisk = allRows.filter((r) => r.percent !== null && r.percent < 75)
  const withAbsences = allRows.filter((r) => r.absent > 0)
  const withLeave = allRows.filter((r) => r.leave > 0)

  const drillQs = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams()
    const base: Record<string, string | undefined> = {
      preset: params.preset,
      from: params.from,
      to: params.to,
      classLevelId: params.classLevelId,
      sectionId: params.sectionId,
      q: params.q,
      risk: params.risk,
      focus: params.focus,
    }
    for (const [key, value] of Object.entries({ ...base, ...patch })) {
      if (value) next.set(key, value)
    }
    const qs = next.toString()
    return qs ? `/attendance/reports?${qs}` : '/attendance/reports'
  }

  const focusLabel =
    params.focus === 'absent'
      ? 'students with absences'
      : params.focus === 'late'
        ? 'students with late arrivals'
        : params.focus === 'leave'
          ? 'students with leave'
          : params.risk === 'below_75'
            ? 'students below 75%'
            : params.risk === 'below_85'
              ? 'students below 85%'
              : 'students shown'

  return (
    <div>
      <PageHeader
        title="Attendance reports"
        description={`${from} to ${to} · ${rows.length} ${focusLabel}`}
      />

      <MetricRow className="mb-4">
        <Metric
          label="Overall attendance"
          value={overall === null ? 'No data' : `${overall}%`}
          sub={`${totalMarked} day-records · tap to show all`}
          emphasis={overall !== null && overall < 85 ? 'warning' : undefined}
          href={drillQs({ risk: null, focus: null })}
        />
        <Metric
          label="Below 75%"
          value={String(atRisk.length)}
          sub="At risk of exam ineligibility · tap to list"
          emphasis={atRisk.length > 0 ? 'danger' : undefined}
          href={drillQs({ risk: 'below_75', focus: null })}
        />
        <Metric
          label="Absences"
          value={String(totals.ABSENT ?? 0)}
          sub={`${withAbsences.length} students · ${totals.LATE ?? 0} late · tap to list`}
          href={drillQs({ focus: 'absent', risk: null })}
        />
        <Metric
          label="Approved leave"
          value={String(totals.LEAVE ?? 0)}
          sub={`${withLeave.length} students · tap to list`}
          href={drillQs({ focus: 'leave', risk: null })}
        />
      </MetricRow>

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search student name or admission number">
          <ReportFilters
            classes={classes}
            sessionName={session?.name ?? null}
            resolvedFrom={from}
            resolvedTo={to}
          />
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState
            title="No attendance in this range"
            description="Try a wider date range, clear filters, or mark attendance first."
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
