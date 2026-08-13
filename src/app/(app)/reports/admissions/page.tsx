import { requireContext } from '@/server/context'
import { resolveRange } from '@/server/modules/reports/range'
import { admissionsReport } from '@/server/modules/reports/admissions'
import { formatNumber } from '@/lib/utils'
import { formatDay } from '@/lib/dates'
import { humanizeStatus } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState, Notice } from '@/components/ui/states'
import { BarList, ColumnChart, Footnote, FunnelBars, PercentCell } from '@/components/reports/primitives'
import { ReportShell } from '../report-shell'

export const metadata = { title: 'Admissions funnel report' }

export default async function AdmissionsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('reports.view')
  const params = await searchParams
  const range = resolveRange(params, 179)
  const report = await admissionsReport(ctx, range)

  const { summary } = report

  return (
    <ReportShell
      report="admissions"
      description={`${range.label} · ${formatNumber(summary.leads)} enquiries received`}
      range={{ from: range.fromInput, to: range.toInput }}
      canExport={ctx.can('reports.export')}
    >
      <MetricRow>
        <Metric
          label="Enquiries"
          value={formatNumber(summary.leads)}
          sub={`${formatNumber(summary.open)} still open`}
        />
        <Metric
          label="Converted"
          value={summary.conversion === null ? 'No data' : `${summary.conversion}%`}
          sub={`${formatNumber(summary.enrolled)} enrolled`}
          emphasis={summary.conversion !== null && summary.conversion < 20 ? 'warning' : undefined}
        />
        <Metric
          label="Lost"
          value={formatNumber(summary.lost)}
          sub={summary.lossRate === null ? 'No data' : `${summary.lossRate}% of intake`}
          emphasis={summary.lost > 0 ? 'warning' : undefined}
        />
        <Metric
          label="Follow-ups overdue"
          value={formatNumber(summary.overdueFollowUps)}
          sub="Across all open enquiries"
          emphasis={summary.overdueFollowUps > 0 ? 'danger' : undefined}
          href="/admissions"
        />
      </MetricRow>

      {summary.overdueFollowUps > 0 ? (
        <Notice tone="warning" title={`${summary.overdueFollowUps} follow-ups are past due`}>
          Every day an enquiry waits makes it less likely to convert.
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>The funnel</CardTitle>
            <span className="text-xs text-ink-subtle">
              Enquiries received in range, at the stage they now hold
            </span>
          </CardHeader>
          <FunnelBars
            stages={report.funnel.map((s) => ({
              stage: s.stage,
              label: humanizeStatus(s.stage),
              count: s.count,
              share: s.share,
              terminal: s.stage === 'LOST',
            }))}
          />
          <Footnote>
            An enquiry sits in exactly one stage, so the rows are a snapshot rather than a
            cumulative path — a lead now at Approved is no longer counted at Contacted.
          </Footnote>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Why enquiries were lost</CardTitle>
          </CardHeader>
          <BarList
            tone="danger"
            emptyLabel="No enquiries lost in this range"
            rows={report.lostReasons.slice(0, 10).map((r) => ({
              label: r.reason,
              value: r.count,
              display: formatNumber(r.count),
            }))}
          />
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Enquiries against enrolments</CardTitle>
          <span className="text-xs text-ink-subtle">By the month the enquiry arrived</span>
        </CardHeader>
        <div className="pt-3">
          <ColumnChart
            points={report.trend.map((t) => ({ label: t.label, values: [t.leads, t.enrolled] }))}
            series={[
              { label: 'Enquiries', color: 'var(--chart-admissions)' },
              { label: 'Enrolled', color: 'var(--chart-attendance)' },
            ]}
            formatValue={(v) => formatNumber(v)}
          />
        </div>
        <Footnote>
          A recent month converts lower than an older one simply because its enquiries have had
          less time — compare like with like.
        </Footnote>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>By source</CardTitle>
            <span className="text-xs text-ink-subtle">Where the enquiry came from</span>
          </CardHeader>
          {report.bySource.length === 0 ? (
            <EmptyState title="No enquiries in range" description="Widen the range to see sources." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Source</TH>
                    <TH align="right">Enquiries</TH>
                    <TH align="right">Enrolled</TH>
                    <TH align="right">Lost</TH>
                    <TH align="right">Conversion</TH>
                  </tr>
                </THead>
                <TBody>
                  {report.bySource.map((s) => (
                    <TR key={s.source}>
                      <TD className="text-sm text-ink">{humanizeStatus(s.source)}</TD>
                      <TD align="right" className="text-sm tnum">
                        {s.leads}
                      </TD>
                      <TD align="right" className="text-sm tnum">
                        {s.enrolled}
                      </TD>
                      <TD align="right" className="text-sm tnum">
                        {s.lost}
                      </TD>
                      <TD align="right">
                        <PercentCell value={s.conversion} warnBelow={20} dangerBelow={10} />
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
            <CardTitle>By owner</CardTitle>
            <span className="text-xs text-ink-subtle">Who the enquiry is assigned to</span>
          </CardHeader>
          {report.byOwner.length === 0 ? (
            <EmptyState title="No enquiries in range" description="Widen the range to see owners." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Owner</TH>
                    <TH align="right">Enquiries</TH>
                    <TH align="right">Enrolled</TH>
                    <TH align="right">Conversion</TH>
                  </tr>
                </THead>
                <TBody>
                  {report.byOwner.map((o) => (
                    <TR key={o.ownerId ?? 'unassigned'}>
                      <TD className="text-sm text-ink">{o.name}</TD>
                      <TD align="right" className="text-sm tnum">
                        {o.leads}
                      </TD>
                      <TD align="right" className="text-sm tnum">
                        {o.enrolled}
                      </TD>
                      <TD align="right">
                        <PercentCell value={o.conversion} warnBelow={20} dangerBelow={10} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Next follow-ups</CardTitle>
          <span className="text-xs text-ink-subtle">Open enquiries with a date set</span>
        </CardHeader>
        {report.upcoming.length === 0 ? (
          <EmptyState
            title="No follow-ups scheduled"
            description="Open enquiries with no next step tend to become lost ones."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Student</TH>
                  <TH>Parent</TH>
                  <TH>Stage</TH>
                  <TH align="right">Due</TH>
                </tr>
              </THead>
              <TBody>
                {report.upcoming.map((lead) => (
                  <TR key={lead.id}>
                    <TD className="text-xs tnum text-ink-subtle">{lead.reference}</TD>
                    <TD className="text-sm text-ink">{lead.studentName}</TD>
                    <TD className="text-sm text-ink-muted">
                      <span className="block">{lead.parentName}</span>
                      <span className="block text-xs tnum text-ink-subtle">{lead.phone}</span>
                    </TD>
                    <TD className="text-sm text-ink-muted">{humanizeStatus(lead.stage)}</TD>
                    <TD align="right" className="text-sm tnum">
                      {lead.nextFollowUpOn ? formatDay(lead.nextFollowUpOn) : '—'}
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
