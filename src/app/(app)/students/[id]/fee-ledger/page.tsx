import Link from 'next/link'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import {
  getStudentLedger,
  getStudentLedgerYearWise,
  studentLedgerQuerySchema,
} from '@/server/modules/accounting/student-ledger-service'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { EmptyState, Notice } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'

export const metadata = { title: 'Fee ledger' }

const SOURCE_HREF: Record<string, (id: string) => string> = {
  FeeInvoice: (id) => `/finance/invoices/${id}`,
  FeePayment: (id) => `/finance/payments/${id}`,
}

export default async function StudentFeeLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fy?: string; page?: string }>
}) {
  const ctx = await requireContext('fees.view')
  const { id } = await params
  const sp = await searchParams
  const query = studentLedgerQuerySchema.parse({ fy: sp.fy, page: sp.page, pageSize: 50 })
  const currency = ctx.tenant.currency || 'INR'
  const money = (minor: number) => formatMoney(Math.abs(minor), currency)
  const drCr = (minor: number) => (minor === 0 ? '—' : `${money(minor)} ${minor > 0 ? 'Dr' : 'Cr'}`)

  let ledger: Awaited<ReturnType<typeof getStudentLedger>> | null = null
  let years: Awaited<ReturnType<typeof getStudentLedgerYearWise>> = []
  let problem: ApiException | null = null
  try {
    ;[ledger, years] = await Promise.all([getStudentLedger(ctx, id, query), getStudentLedgerYearWise(ctx, id)])
  } catch (e) {
    if (!(e instanceof ApiException)) throw e
    problem = e
  }

  if (!ledger) {
    return (
      <div className="space-y-4">
        <PageHeader title="Fee ledger" actions={<BackButton fallbackHref={`/students/${id}`} />} />
        <Notice tone="warning" title="Fee ledger unavailable">
          {problem?.message}
          {problem?.code === 'FEATURE_DISABLED' ? (
            <span className="mt-2 flex flex-wrap gap-3">
              {ctx.can('fees.accounts') ? (
                <Link href={`/finance/students/${id}`} className="font-medium text-[var(--brand-600)] hover:underline">
                  Open the fee account instead
                </Link>
              ) : null}
              {ctx.can('accounts.manage') ? (
                <Link href="/accounts/settings" className="font-medium text-[var(--brand-600)] hover:underline">
                  Switch on the student ledger
                </Link>
              ) : null}
            </span>
          ) : null}
        </Notice>
      </div>
    )
  }

  const fyHref = (fy: string) => `/students/${id}/fee-ledger?fy=${fy}`
  const exportHref = (format: 'csv' | 'pdf') => `/api/v1/accounting/students/${id}/ledger/export?fy=${query.fy}&format=${format}`
  const canExport = ctx.can('fees.export')

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Fee ledger · ${ledger.student.name}`}
        description={`${ledger.student.admissionNo} · statement of account, ${ledger.fiscalYear ? `FY ${ledger.fiscalYear.label}` : 'all years'}`}
        actions={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {canExport ? (
              <>
                <a href={exportHref('csv')} className="font-medium text-[var(--brand-600)] hover:underline">Download CSV</a>
                <a href={exportHref('pdf')} target="_blank" rel="noopener" className="font-medium text-[var(--brand-600)] hover:underline">PDF</a>
              </>
            ) : null}
            <Link href={`/students/${id}`} className="font-medium text-[var(--brand-600)] hover:underline">
              Student 360
            </Link>
            <BackButton fallbackHref={`/students/${id}`} />
          </div>
        }
      />

      <Card>
        <CardContent className="pt-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-ink-muted">Financial year</span>
              <select name="fy" defaultValue={query.fy} className="mt-1 block h-9 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm">
                <option value="all">All years (cumulative)</option>
                {ledger.fiscalYears.map((y, i) => (
                  <option key={y.label} value={y.label}>
                    FY {y.label}{i === 0 ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary">Show</Button>
          </form>
        </CardContent>
      </Card>

      <MetricRow>
        <Metric label="Opening B/F" value={drCr(ledger.openingMinor)} sub={ledger.fiscalYear ? `on ${ledger.fiscalYear.startsOn}` : 'all years open at zero'} />
        <Metric label="Debits (fees charged)" value={money(ledger.totals.debitMinor)} />
        <Metric label="Credits (received, waived)" value={money(ledger.totals.creditMinor)} />
        <Metric
          label="Closing balance"
          value={drCr(ledger.closingMinor)}
          sub={ledger.closingSide === 'Dr' ? 'due from student' : ledger.closingSide === 'Cr' ? 'advance held' : 'settled'}
          emphasis={ledger.closingMinor > 0 ? 'warning' : undefined}
        />
      </MetricRow>
      {!ledger.summary.reconciled ? (
        <Notice tone="warning" title="Ledger does not match the fee card">
          The statement balance differs from the invoice balances. Finance staff can review it in the reconciliation panel.
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Year-wise outstanding</CardTitle>
          <span className="text-xs text-ink-subtle">Each year opens on the previous year&apos;s closing</span>
        </CardHeader>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Financial year</TH>
                <TH align="right">Opening B/F</TH>
                <TH align="right">Debits</TH>
                <TH align="right">Credits</TH>
                <TH align="right">Closing</TH>
              </tr>
            </THead>
            <TBody>
              {[...years].reverse().map((y) => (
                <TR key={y.label}>
                  <TD>
                    <Link href={fyHref(y.label)} className="font-medium text-[var(--brand-600)] hover:underline">FY {y.label}</Link>
                    {query.fy === y.label ? <Badge tone="neutral" className="ml-2">showing</Badge> : null}
                  </TD>
                  <TD align="right" className="tnum">{drCr(y.openingMinor)}</TD>
                  <TD align="right" className="tnum">{y.debitMinor ? money(y.debitMinor) : '—'}</TD>
                  <TD align="right" className="tnum">{y.creditMinor ? money(y.creditMinor) : '—'}</TD>
                  <TD align="right" className="tnum font-medium">{drCr(y.closingMinor)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Statement</CardTitle>
        </CardHeader>
        {ledger.rows.length === 0 ? (
          <EmptyState title="No entries" description="Nothing was charged or received in this period." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Particulars</TH>
                  <TH>Voucher</TH>
                  <TH align="right">Debit</TH>
                  <TH align="right">Credit</TH>
                  <TH align="right">Balance</TH>
                </tr>
              </THead>
              <TBody>
                {ledger.page === 1 ? (
                  <TR>
                    <TD className="tnum">{ledger.fiscalYear?.startsOn ?? '—'}</TD>
                    <TD className="font-medium">Opening balance (brought forward)</TD>
                    <TD />
                    <TD />
                    <TD />
                    <TD align="right" className="tnum">{drCr(ledger.openingMinor)}</TD>
                  </TR>
                ) : null}
                {ledger.rows.map((r) => {
                  const href = SOURCE_HREF[r.source.type]?.(r.source.id)
                  return (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap tnum">{r.date}</TD>
                      <TD className="text-sm">{r.particulars}</TD>
                      <TD className="whitespace-nowrap text-sm">
                        {href ? (
                          <Link href={href} className="font-medium text-[var(--brand-600)] hover:underline">{r.voucherNo}</Link>
                        ) : (
                          r.voucherNo
                        )}
                        <span className="block text-xs text-ink-subtle">{r.voucherType}</span>
                      </TD>
                      <TD align="right" className="tnum">{r.debitMinor ? money(r.debitMinor) : ''}</TD>
                      <TD align="right" className="tnum">{r.creditMinor ? money(r.creditMinor) : ''}</TD>
                      <TD align="right" className="tnum">{drCr(r.balanceMinor)}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Pagination total={ledger.totalRows} page={ledger.page} pageSize={ledger.pageSize} label="entries" />
      </Card>
    </div>
  )
}
