import { requireContext } from '@/server/context'
import { resolveRange } from '@/server/modules/reports/range'
import { collectionReport } from '@/server/modules/reports/collection'
import { formatMoney, formatNumber } from '@/lib/utils'
import { formatDay } from '@/lib/dates'
import { humanizeStatus } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { BarList, ColumnChart, Footnote, PercentCell } from '@/components/reports/primitives'
import { ReportShell } from '../report-shell'

export const metadata = { title: 'Fee collection report' }

export default async function CollectionReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('reports.view')
  const params = await searchParams
  const range = resolveRange(params, 89)
  const report = await collectionReport(ctx, range)

  const currency = ctx.tenant.currency
  const money = (minor: number) => formatMoney(minor, currency)
  const { summary } = report

  return (
    <ReportShell
      report="collection"
      description={`${range.label} · ${formatNumber(summary.paymentsTaken)} payments against ${formatNumber(summary.invoicesIssued)} invoices`}
      range={{ from: range.fromInput, to: range.toInput }}
      canExport={ctx.can('reports.export')}
    >
      <MetricRow>
        <Metric
          label="Collected in range"
          value={money(summary.collectedMinor)}
          sub={`${formatNumber(summary.paymentsTaken)} payments`}
        />
        <Metric
          label="Billed in range"
          value={money(summary.billedMinor)}
          sub={
            summary.discountMinor > 0
              ? `after ${money(summary.discountMinor)} concessions`
              : `${formatNumber(summary.invoicesIssued)} invoices raised`
          }
        />
        <Metric
          label="Outstanding today"
          value={money(summary.outstandingMinor)}
          sub={`${formatNumber(summary.invoicesOutstanding)} invoices unpaid`}
          emphasis={summary.outstandingMinor > 0 ? 'warning' : undefined}
        />
        <Metric
          label="Overdue today"
          value={money(summary.overdueMinor)}
          sub={`${formatNumber(summary.invoicesOverdue)} past their due date`}
          emphasis={summary.overdueMinor > 0 ? 'danger' : undefined}
        />
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Billed against collected</CardTitle>
          <span className="text-xs text-ink-subtle">
            {summary.realisation === null
              ? 'Nothing billed in this range'
              : `${summary.realisation}% of the range's billing settled`}
          </span>
        </CardHeader>
        <div className="pt-3">
          <ColumnChart
            points={report.trend.map((t) => ({
              label: t.label,
              values: [t.billedMinor, t.collectedMinor],
            }))}
            series={[
              { label: 'Billed', color: 'var(--chart-pending)' },
              { label: 'Collected', color: 'var(--chart-attendance)' },
            ]}
            formatValue={money}
          />
        </div>
        <Footnote>
          Billing is counted by the date an invoice was issued and collection by the date a
          payment cleared, so a bill raised in one month and paid in the next appears in both.
        </Footnote>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Arrears by age</CardTitle>
            <span className="text-xs text-ink-subtle">Balance as of today</span>
          </CardHeader>
          <BarList
            tone="danger"
            emptyLabel="Nothing outstanding — every invoice is settled"
            rows={report.ageing
              .filter((a) => a.amountMinor > 0 || a.invoices > 0)
              .map((a) => ({
                label: a.bucket,
                value: a.amountMinor,
                display: money(a.amountMinor),
                note: `${a.invoices} inv`,
              }))}
          />
          <Footnote>
            Ageing is measured from each invoice&apos;s due date, not its issue date.
          </Footnote>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>How families paid</CardTitle>
            <span className="text-xs text-ink-subtle">Cleared payments in range</span>
          </CardHeader>
          <BarList
            tone="info"
            emptyLabel="No payments cleared in this range"
            rows={report.byMode.map((m) => ({
              label: humanizeStatus(m.mode),
              value: m.amountMinor,
              display: money(m.amountMinor),
              note: `${m.count}×`,
            }))}
          />
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Collection by class</CardTitle>
          <span className="text-xs text-ink-subtle">Session to date, not range-limited</span>
        </CardHeader>
        {report.byClass.length === 0 ? (
          <EmptyState
            title="No invoices raised yet"
            description="Raise fee invoices from Finance and this table fills itself."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Class</TH>
                  <TH align="right">Students billed</TH>
                  <TH align="right">Billed</TH>
                  <TH align="right">Collected</TH>
                  <TH align="right">Outstanding</TH>
                  <TH align="right">Realisation</TH>
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
                      {money(c.billedMinor)}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {money(c.collectedMinor)}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {c.outstandingMinor > 0 ? (
                        <span className="text-warning">{money(c.outstandingMinor)}</span>
                      ) : (
                        money(0)
                      )}
                    </TD>
                    <TD align="right">
                      <PercentCell value={c.realisation} warnBelow={85} dangerBelow={65} />
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
            <CardTitle>Billing by fee head</CardTitle>
            <span className="text-xs text-ink-subtle">Net of concessions</span>
          </CardHeader>
          <BarList
            emptyLabel="No invoice lines in this range"
            rows={report.byHead.slice(0, 12).map((h) => ({
              label: h.name,
              value: h.billedMinor,
              display: money(h.billedMinor),
              note: h.code,
            }))}
          />
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Largest balances</CardTitle>
            <span className="text-xs text-ink-subtle">Where a call is worth most</span>
          </CardHeader>
          {report.defaulters.length === 0 ? (
            <EmptyState title="Nothing outstanding" description="Every invoice is settled." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Student</TH>
                    <TH>Class</TH>
                    <TH align="right">Oldest due</TH>
                    <TH align="right">Balance</TH>
                  </tr>
                </THead>
                <TBody>
                  {report.defaulters.map((d) => (
                    <TR key={d.studentId}>
                      <TD>
                        <span className="block text-sm text-ink">{d.name}</span>
                        <span className="block text-xs tnum text-ink-subtle">{d.admissionNo}</span>
                      </TD>
                      <TD className="text-sm text-ink-muted">{d.className}</TD>
                      <TD align="right" className="text-xs tnum text-ink-subtle">
                        {d.oldestDueOn ? formatDay(d.oldestDueOn) : '—'}
                      </TD>
                      <TD align="right" className="text-sm font-medium tnum text-ink">
                        {money(d.outstandingMinor)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>
    </ReportShell>
  )
}
