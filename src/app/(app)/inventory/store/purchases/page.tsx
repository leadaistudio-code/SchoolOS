import Link from 'next/link'
import { PackagePlus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listStorePurchases } from '@/server/modules/store/service'
import { storePaymentLabel } from '@/lib/store/options'
import { PERIOD_PRESETS } from '@/lib/periods'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { ACCENT, ActionLink } from '@/components/ui/stat-card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { StoreTabs } from '../store-tabs'
import { StoreFilters } from '../store-filters'

export const metadata = { title: 'Store stock in' }

export default async function StorePurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('store.view')
  const params = await searchParams
  const purchases = await listStorePurchases(ctx, { q: params.q, preset: params.preset })
  const canManage = ctx.can('store.manage')
  const currency = ctx.tenant.currency
  const total = purchases.reduce((s, p) => s + p.totalMinor, 0)

  const newLink = canManage ? (
    <ActionLink href="/inventory/store/purchases/new" icon={PackagePlus} accent={ACCENT.amber}>
      Receive stock
    </ActionLink>
  ) : null

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock in"
        description="Deliveries received from vendors. Each receipt raises stock and is paid from cash or bank."
        actions={newLink}
      />
      <StoreTabs ctx={ctx} active="purchases" />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search receipt no., vendor or bill no.">
          <StoreFilters
            filters={[{ param: 'preset', label: 'Period', allLabel: 'Any time', options: PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })) }]}
          />
        </SearchBar>
        {purchases.length === 0 ? (
          <EmptyState
            title="No stock received yet"
            description="When a vendor delivers uniforms, books or stationery, record it here so stock and cost stay right."
            action={newLink ?? undefined}
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Receipt</TH>
                  <TH>Date</TH>
                  <TH>Vendor</TH>
                  <TH align="right">Lines</TH>
                  <TH>Paid by</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {purchases.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/inventory/store/purchases/${p.id}`} className="font-medium text-[var(--brand-600)] hover:underline">
                        {p.number}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{formatDay(p.purchaseDate)}</TD>
                    <TD>
                      <p className="text-sm text-ink">{p.vendorName}</p>
                      <p className="text-xs text-ink-subtle">{[p.invoiceNo && `Bill ${p.invoiceNo}`, p.createdByLabel].filter(Boolean).join(' · ')}</p>
                    </TD>
                    <TD align="right">{p._count.lines}</TD>
                    <TD>{storePaymentLabel(p.paymentMode)}</TD>
                    <TD align="right" className="font-medium text-ink">{formatMoney(p.totalMinor, currency)}</TD>
                  </TR>
                ))}
                <tr className="bg-surface-2">
                  <TD colSpan={5} className="font-semibold text-ink">Total ({purchases.length})</TD>
                  <TD align="right" className="font-semibold text-ink">{formatMoney(total, currency)}</TD>
                </tr>
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
