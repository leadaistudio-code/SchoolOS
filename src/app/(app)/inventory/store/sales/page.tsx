import Link from 'next/link'
import { BadgePercent, IndianRupee, Receipt, ShoppingCart, TrendingUp } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listStoreSales, type SaleFilter } from '@/server/modules/store/service'
import { STORE_PAYMENT_MODES, storePaymentLabel } from '@/lib/store/options'
import { PERIOD_PRESETS } from '@/lib/periods'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { ACCENT, ActionLink, StatCard } from '@/components/ui/stat-card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'
import { StoreTabs } from '../store-tabs'
import { StoreFilters } from '../store-filters'

export const metadata = { title: 'Store sales' }

const STAMP = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default async function StoreSalesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('store.view')
  const params = await searchParams
  const filter: SaleFilter = { q: params.q, preset: params.preset, status: params.status, mode: params.mode }
  const { sales, totals } = await listStoreSales(ctx, filter)
  const currency = ctx.tenant.currency
  const exportQs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString()
  const margin = totals.totalMinor - totals.taxMinor - totals.costMinor

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales & bills"
        description="Every store bill with payment mode, GST and margin. Open a bill to reprint or void it."
        actions={
          <>
            <a href={`/api/v1/store/sales/export${exportQs ? `?${exportQs}` : ''}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Download CSV
            </a>
            {ctx.can('store.sell') ? (
              <ActionLink href="/inventory/store/sell" icon={ShoppingCart} accent={ACCENT.emerald}>
                New bill
              </ActionLink>
            ) : null}
          </>
        }
      />
      <StoreTabs ctx={ctx} active="sales" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sales" value={formatMoney(totals.totalMinor, currency)} hint={`${totals.count} bills (voided excluded)`} icon={IndianRupee} accent={ACCENT.emerald} />
        <StatCard label="GST collected" value={formatMoney(totals.taxMinor, currency)} hint="Included in sales" icon={Receipt} accent={ACCENT.sky} />
        <StatCard label="Discounts given" value={formatMoney(totals.discountMinor, currency)} icon={BadgePercent} accent={ACCENT.amber} />
        <StatCard label="Gross margin" value={formatMoney(margin, currency)} hint={`Cost of goods ${formatMoney(totals.costMinor, currency)}`} icon={TrendingUp} accent={ACCENT.indigo} tone={margin < 0 ? 'danger' : undefined} />
      </div>

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search bill no., buyer, phone or admission no.">
          <StoreFilters
            filters={[
              { param: 'preset', label: 'Period', allLabel: 'Any time', options: PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })) },
              { param: 'mode', label: 'Payment', allLabel: 'Any mode', options: [...STORE_PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label })), { value: 'FEE_ACCOUNT', label: 'Added to fees' }] },
              { param: 'status', label: 'Status', allLabel: 'All bills', options: [{ value: 'COMPLETED', label: 'Completed' }, { value: 'VOIDED', label: 'Voided' }] },
            ]}
          />
        </SearchBar>
        {sales.length === 0 ? (
          <EmptyState title="No bills found" description="Bills made at the store counter show up here." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Bill</TH>
                  <TH>Date</TH>
                  <TH>Buyer</TH>
                  <TH align="right">Items</TH>
                  <TH>Payment</TH>
                  <TH align="right">GST</TH>
                  <TH align="right">Total</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {sales.map((s) => (
                  <TR key={s.id} className={s.status === 'VOIDED' ? 'opacity-60' : undefined}>
                    <TD>
                      <Link href={`/inventory/store/sales/${s.id}`} className="font-medium text-[var(--brand-600)] hover:underline">
                        {s.number}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{STAMP.format(s.soldAt)}</TD>
                    <TD>
                      <p className="text-sm text-ink">{s.customerName ?? 'Walk-in'}</p>
                      <p className="text-xs text-ink-subtle">{[s.student?.admissionNo, s.customerPhone, s.soldByLabel && `by ${s.soldByLabel}`].filter(Boolean).join(' · ')}</p>
                    </TD>
                    <TD align="right">{s._count.lines}</TD>
                    <TD>{storePaymentLabel(s.paymentMode)}</TD>
                    <TD align="right">{s.taxMinor ? formatMoney(s.taxMinor, currency) : '—'}</TD>
                    <TD align="right" className={s.status === 'VOIDED' ? 'line-through' : 'font-medium text-ink'}>{formatMoney(s.totalMinor, currency)}</TD>
                    <TD>
                      <StatusBadge status={s.status} tone={s.status === 'VOIDED' ? 'danger' : 'success'} label={s.status === 'VOIDED' ? 'Voided' : 'Paid'} />
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
