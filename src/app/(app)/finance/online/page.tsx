import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listPayments, paymentFilterSchema, paymentSummary } from '@/server/modules/finance/payments'
import { splitInvoiceAmount } from '@/server/modules/accounts/math'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { PaymentFilters } from '../payments/filters'
import { PaymentTable } from '../payments/payment-table'

export const metadata = { title: 'Online / app fees' }

export default async function OnlineFeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const filter = { ...paymentFilterSchema.parse(params), channel: 'online' as const }
  const itemized = params.layout === 'itemized'

  const [{ rows, total }, summary] = await Promise.all([
    listPayments(ctx, query, filter),
    paymentSummary(ctx, query.q, filter),
  ])
  const currency = ctx.tenant.currency

  // Itemized: split each payment across the fee heads of the invoices it paid.
  const items = itemized
    ? await ctx.db.feePaymentAllocation.findMany({
        where: { paymentId: { in: rows.map((r) => r.id) } },
        select: {
          paymentId: true,
          amountMinor: true,
          invoice: {
            select: {
              number: true,
              title: true,
              lateFeeMinor: true,
              lines: { select: { feeHeadId: true, label: true, amountMinor: true, discountMinor: true, taxPercent: true } },
            },
          },
        },
      })
    : []
  const itemsByPayment = new Map<string, { invoice: string; label: string; amountMinor: number }[]>()
  for (const a of items) {
    const list = itemsByPayment.get(a.paymentId) ?? []
    for (const s of splitInvoiceAmount(a.invoice, a.amountMinor)) {
      list.push({ invoice: a.invoice.number, label: s.label, amountMinor: s.amountMinor })
    }
    itemsByPayment.set(a.paymentId, list)
  }

  const layoutHref = (layout: string) => {
    const next = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]))
    if (layout === 'combined') next.delete('layout')
    else next.set('layout', layout)
    return `/finance/online?${next.toString()}`
  }
  const exportQuery = new URLSearchParams(
    Object.entries({ ...params, channel: 'online' }).filter((e): e is [string, string] => !!e[1] && e[0] !== 'page' && e[0] !== 'layout'),
  ).toString()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Online / app fees"
        description="Fees parents paid through the app or payment link, with gateway UTR / transaction IDs."
        actions={
          <div className="flex items-center gap-3">
            {ctx.can('fees.export') ? (
              <a href={`/api/v1/finance/payments/export?${exportQuery}`} className="text-sm font-medium text-[var(--brand-600)] hover:underline">
                Export CSV
              </a>
            ) : null}
            <BackButton fallbackHref="/finance" />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Received online</div>
          <div className="mt-1 text-lg font-semibold tnum">{formatMoney(summary.totalMinor, currency)}</div>
          <div className="text-xs text-ink-subtle">{summary.receiptCount} payments</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-ink-muted">UPI / card / net banking</div>
          <div className="mt-1 text-lg font-semibold tnum">{formatMoney(summary.digitalMinor, currency)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Failed / cancelled</div>
          <div className="mt-1 text-lg font-semibold tnum">{summary.voidCount}</div>
          <div className="text-xs text-ink-subtle">attempts in this view</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search UTR / transaction ID, receipt, student or admission number">
          <PaymentFilters hideChannel />
          <div className="flex overflow-hidden rounded-[var(--radius-sm)] border border-line text-sm">
            <Link href={layoutHref('combined')} className={`px-3 py-1.5 ${!itemized ? 'bg-[var(--brand-600)] text-white' : 'text-ink-muted'}`}>Combined</Link>
            <Link href={layoutHref('itemized')} className={`px-3 py-1.5 ${itemized ? 'bg-[var(--brand-600)] text-white' : 'text-ink-muted'}`}>Itemized</Link>
          </div>
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState title="No online payments in this view" description="Payments made through the parent app or payment links appear here." />
        ) : itemized ? (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Receipt / UTR</TH>
                    <TH>Student</TH>
                    <TH>Invoice</TH>
                    <TH>Fee head</TH>
                    <TH align="right">Amount</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.flatMap((p) => {
                    const lines = itemsByPayment.get(p.id) ?? []
                    const allocated = lines.reduce((t, l) => t + l.amountMinor, 0)
                    const all = p.amountMinor - allocated > 0
                      ? [...lines, { invoice: '', label: 'Advance / unallocated', amountMinor: p.amountMinor - allocated }]
                      : lines
                    return (all.length ? all : [{ invoice: '', label: 'Not yet allocated', amountMinor: p.amountMinor }]).map((l, i) => (
                      <TR key={`${p.id}:${i}`}>
                        <TD className="whitespace-nowrap text-sm">{i === 0 ? formatDay(p.paidAt ?? p.createdAt) : ''}</TD>
                        <TD className="text-sm">
                          {i === 0 ? (
                            <>
                              <Link href={`/finance/payments/${p.id}`} className="text-[var(--brand-600)] hover:underline">{p.receiptNumber ?? '—'}</Link>
                              {p.providerPaymentId ? <span className="block text-xs text-ink-subtle">{p.providerPaymentId}</span> : null}
                            </>
                          ) : null}
                        </TD>
                        <TD className="text-sm">{i === 0 ? <>{p.studentName}<span className="block text-xs text-ink-subtle">{p.admissionNo}</span></> : null}</TD>
                        <TD className="text-sm text-ink-muted">{l.invoice}</TD>
                        <TD className="text-sm">{l.label}</TD>
                        <TD align="right" className="text-sm">{formatMoney(l.amountMinor, currency)}</TD>
                      </TR>
                    ))
                  })}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="payments" />
          </>
        ) : (
          <PaymentTable
            rows={rows.map((p) => ({ ...p, paidAt: p.paidAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString() }))}
            currency={currency}
            total={total}
            page={query.page}
            pageSize={query.pageSize}
            canExport={ctx.can('fees.export')}
          />
        )}
      </Card>
    </div>
  )
}
