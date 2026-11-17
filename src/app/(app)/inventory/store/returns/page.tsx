import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listStoreReturns, type ReturnFilter } from '@/server/modules/store/returns'
import { storePaymentLabel } from '@/lib/store/options'
import { PERIOD_PRESETS } from '@/lib/periods'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { ACCENT, ActionLink } from '@/components/ui/stat-card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { StoreTabs } from '../store-tabs'
import { StoreFilters } from '../store-filters'

export const metadata = { title: 'Store returns' }

const STAMP = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default async function StoreReturnsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('store.view')
  const params = await searchParams
  const filter: ReturnFilter = { q: params.q, preset: params.preset, kind: params.kind }
  const rows = await listStoreReturns(ctx, filter)
  const currency = ctx.tenant.currency

  return (
    <div className="space-y-4">
      <PageHeader
        title="Returns & exchanges"
        description="Partial returns against completed bills. Stock is restored and refunds or replacement bills are recorded."
        actions={
          ctx.canAny('store.return', 'store.void') ? (
            <ActionLink href="/inventory/store/returns/new" icon={RotateCcw} accent={ACCENT.amber}>
              New return
            </ActionLink>
          ) : undefined
        }
      />
      <StoreTabs ctx={ctx} active="returns" />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search return no., bill no., notes…">
          <StoreFilters
            filters={[
              { param: 'preset', label: 'Period', allLabel: 'Any time', options: PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })) },
              {
                param: 'kind',
                label: 'Type',
                allLabel: 'All',
                options: [
                  { value: 'RETURN', label: 'Refund only' },
                  { value: 'EXCHANGE', label: 'Exchange' },
                ],
              },
            ]}
          />
        </SearchBar>
        {rows.length === 0 ? (
          <EmptyState title="No returns yet" description="Returns and exchanges against store bills appear here." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Return</TH>
                  <TH>Date</TH>
                  <TH>Original bill</TH>
                  <TH>Type</TH>
                  <TH align="right">Refund</TH>
                  <TH align="right">Collected</TH>
                  <TH>Settlement</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/inventory/store/returns/${r.id}`} className="font-medium text-[var(--brand-600)] hover:underline">
                        {r.number}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{STAMP.format(r.createdAt)}</TD>
                    <TD>
                      <Link href={`/inventory/store/sales/${r.sale.id}`} className="text-sm hover:underline">
                        {r.sale.number}
                      </Link>
                    </TD>
                    <TD>
                      <StatusBadge status={r.kind} label={r.kind === 'EXCHANGE' ? 'Exchange' : 'Return'} tone={r.kind === 'EXCHANGE' ? 'info' : 'warning'} />
                    </TD>
                    <TD align="right">{r.refundMinor ? formatMoney(r.refundMinor, currency) : '—'}</TD>
                    <TD align="right">{r.collectedMinor ? formatMoney(r.collectedMinor, currency) : '—'}</TD>
                    <TD className="text-xs text-ink-subtle">
                      {[r.refundMinor && r.refundMode ? `Refund ${storePaymentLabel(r.refundMode)}` : null, r.collectedMinor && r.collectedMode ? `+${storePaymentLabel(r.collectedMode)}` : null, r.exchangeSale ? `→ ${r.exchangeSale.number}` : null]
                        .filter(Boolean)
                        .join(' · ')}
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