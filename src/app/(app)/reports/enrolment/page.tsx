import { requireContext } from '@/server/context'
import { resolveRange } from '@/server/modules/reports/range'
import { enrolmentReport } from '@/server/modules/reports/enrolment'
import { formatNumber } from '@/lib/utils'
import { humanizeStatus } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState, Notice } from '@/components/ui/states'
import { BarList, ColumnChart, Footnote, PercentCell } from '@/components/reports/primitives'
import { ReportShell } from '../report-shell'

export const metadata = { title: 'Enrolment report' }

export default async function EnrolmentReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('reports.view')
  const params = await searchParams
  const range = resolveRange(params, 364)
  const report = await enrolmentReport(ctx, range)

  const { summary } = report

  return (
    <ReportShell
      report="enrolment"
      description={
        report.session
          ? `${report.session.name} · ${formatNumber(summary.active)} students on roll`
          : `${formatNumber(summary.active)} students on roll`
      }
      range={{ from: range.fromInput, to: range.toInput }}
      canExport={ctx.can('reports.export')}
    >
      <MetricRow>
        <Metric
          label="Students on roll"
          value={formatNumber(summary.active)}
          sub={`${formatNumber(summary.admittedInRange)} admitted in range`}
        />
        <Metric
          label="Seat utilisation"
          value={summary.utilisation === null ? 'No capacity set' : `${summary.utilisation}%`}
          sub={`${formatNumber(summary.enrolled)} of ${formatNumber(summary.capacity)} seats`}
          emphasis={
            summary.utilisation !== null && summary.utilisation > 100 ? 'danger' : undefined
          }
        />
        <Metric
          label="Seats free"
          value={formatNumber(summary.seatsFree)}
          sub="Across every section"
        />
        <Metric
          label="Using transport"
          value={formatNumber(summary.transportUsers)}
          sub={`${formatNumber(summary.borrowers)} books on loan`}
        />
      </MetricRow>

      {summary.withoutGuardian > 0 ? (
        <Notice
          tone="warning"
          title={`${summary.withoutGuardian} students have no guardian on file`}
        >
          Nobody can be reached for them in an emergency, and fee notices have no recipient.
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Strength by class</CardTitle>
          <span className="text-xs text-ink-subtle">Capacity is the sum of section capacities</span>
        </CardHeader>
        {report.byClass.length === 0 ? (
          <EmptyState
            title="No classes in the current session"
            description="Create classes and sections under Academics."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Class</TH>
                  <TH align="right">Sections</TH>
                  <TH align="right">Students</TH>
                  <TH align="right">Boys</TH>
                  <TH align="right">Girls</TH>
                  <TH align="right">Capacity</TH>
                  <TH align="right">Free</TH>
                  <TH align="right">Utilisation</TH>
                </tr>
              </THead>
              <TBody>
                {report.byClass.map((c) => (
                  <TR key={c.id}>
                    <TD className="text-sm text-ink">{c.name}</TD>
                    <TD align="right" className="text-sm tnum">
                      {c.sections}
                    </TD>
                    <TD align="right" className="text-sm font-medium tnum text-ink">
                      {c.students}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {c.boys}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {c.girls}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {c.capacity}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {c.seatsFree}
                    </TD>
                    <TD align="right">
                      {c.utilisation !== null && c.utilisation > 100 ? (
                        <span className="text-sm font-medium tnum text-[var(--danger)]">
                          {c.utilisation}%
                        </span>
                      ) : (
                        <PercentCell value={c.utilisation} />
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Footnote>
          A utilisation above 100% means a section is holding more students than its stated
          capacity — worth checking before the next admission.
        </Footnote>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Admissions by month</CardTitle>
          <span className="text-xs text-ink-subtle">By recorded admission date</span>
        </CardHeader>
        <div className="pt-3">
          <ColumnChart
            points={report.admissionsTrend.map((t) => ({ label: t.label, values: [t.count] }))}
            series={[{ label: 'Admitted', color: 'var(--chart-admissions)' }]}
            formatValue={(v) => formatNumber(v)}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>By gender</CardTitle>
          </CardHeader>
          <BarList
            rows={report.byGender.map((g) => ({
              label: humanizeStatus(g.gender),
              value: g.count,
              display: formatNumber(g.count),
              note: summary.active ? `${Math.round((g.count / summary.active) * 100)}%` : undefined,
            }))}
          />
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <BarList
            tone="info"
            emptyLabel="No categories recorded"
            rows={report.byCategory.slice(0, 10).map((c) => ({
              label: c.category,
              value: c.count,
              display: formatNumber(c.count),
            }))}
          />
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>By status</CardTitle>
            <span className="text-xs text-ink-subtle">Including past students</span>
          </CardHeader>
          <BarList
            tone="warning"
            rows={report.byStatus.map((s) => ({
              label: humanizeStatus(s.status),
              value: s.count,
              display: formatNumber(s.count),
            }))}
          />
        </Card>
      </div>
    </ReportShell>
  )
}
