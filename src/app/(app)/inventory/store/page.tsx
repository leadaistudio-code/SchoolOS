import Link from 'next/link'
import { AlertTriangle, Boxes, IndianRupee, PackagePlus, ShoppingCart, TrendingUp, Wallet } from 'lucide-react'
import { requireContext } from '@/server/context'
import { storeDashboard } from '@/server/modules/store/service'
import { storePaymentLabel } from '@/lib/store/options'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { ACCENT, ActionLink, StatCard } from '@/components/ui/stat-card'
import { formatMoney, formatNumber } from '@/lib/utils'
import { StoreTabs } from './store-tabs'

export const metadata = { title: 'School store' }

const TIME = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const DAY = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })

export default async function StoreDashboardPage() {
  const ctx = await requireContext('store.view')
  const d = await storeDashboard(ctx)
  const currency = ctx.tenant.currency
  const trendMax = Math.max(1, ...d.trend.map((t) => t.totalMinor))
  const catMax = Math.max(1, ...d.categories.map((c) => c.salesMinor))

  return (
    <div className="space-y-4">
      <PageHeader
        title="School store"
        description="Books, uniforms, shoes, bags and stationery: stock in, sell at the counter, and the stock goes down automatically."
        actions={
          <>
            {ctx.can('store.manage') ? (
              <ActionLink href="/inventory/store/purchases/new" icon={PackagePlus} accent={ACCENT.amber}>
                Receive stock
              </ActionLink>
            ) : null}
            {ctx.can('store.sell') ? (
              <ActionLink href="/inventory/store/sell" icon={ShoppingCart} accent={ACCENT.emerald}>
                New bill
              </ActionLink>
            ) : null}
          </>
        }
      />
      <StoreTabs ctx={ctx} active="dashboard" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today's sales"
          value={formatMoney(d.today.totalMinor, currency)}
          hint={`${d.today.count} bills${d.todayModes.length ? ` · ${d.todayModes.map((m) => `${storePaymentLabel(m.mode)} ${formatMoney(m.totalMinor, currency)}`).join(' · ')}` : ''}`}
          icon={IndianRupee}
          accent={ACCENT.emerald}
          href="/inventory/store/sales?preset=today"
        />
        <StatCard
          label="This month"
          value={formatMoney(d.month.totalMinor, currency)}
          hint={`${d.month.count} bills · margin ${formatMoney(d.month.grossProfitMinor, currency)}`}
          icon={TrendingUp}
          accent={ACCENT.indigo}
          href="/inventory/store/sales?preset=month"
        />
        <StatCard
          label="Stock value (cost)"
          value={formatMoney(d.stock.valueMinor, currency)}
          hint={`${formatNumber(d.stock.units)} units · ${d.stock.itemCount} items · MRP ${formatMoney(d.stock.retailValueMinor, currency)}`}
          icon={Wallet}
          accent={ACCENT.sky}
          href="/inventory/store/items"
        />
        <StatCard
          label="Reorder alerts"
          value={formatNumber(d.stock.outCount + d.stock.lowCount)}
          hint={`${d.stock.outCount} out of stock · ${d.stock.lowCount} running low`}
          icon={AlertTriangle}
          accent={d.stock.outCount ? ACCENT.rose : ACCENT.amber}
          tone={d.stock.outCount ? 'danger' : d.stock.lowCount ? 'warning' : undefined}
          href="/inventory/store/items?stock=low"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales, last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            {d.trend.every((t) => t.totalMinor === 0) ? (
              <p className="py-14 text-center text-sm text-ink-muted">No sales in the last two weeks.</p>
            ) : (
              <div className="flex h-44 items-end gap-1.5">
                {d.trend.map((t) => (
                  <div key={t.day} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${t.day}: ${formatMoney(t.totalMinor, currency)}`}>
                    <div
                      className="w-full rounded-t-md transition-opacity group-hover:opacity-80"
                      style={{
                        height: `${Math.max(t.totalMinor > 0 ? 4 : 0, (t.totalMinor / trendMax) * 100)}%`,
                        background: `linear-gradient(180deg, ${ACCENT.emerald}, ${ACCENT.teal})`,
                      }}
                    />
                    <span className="text-[10px] text-ink-subtle">{DAY.format(new Date(`${t.day}T00:00:00Z`))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reorder now</CardTitle>
            <Link href="/inventory/store/items?stock=low" className="text-xs text-[var(--brand-600)] hover:underline">
              All low stock
            </Link>
          </CardHeader>
          <CardContent>
            {d.alerts.length === 0 ? (
              <p className="py-12 text-center text-sm text-ink-muted">Every item is above its reorder level.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {d.alerts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{a.label}</p>
                      <p className="text-xs text-ink-subtle">{a.sku} · reorder at {a.reorderLevel}</p>
                    </div>
                    <Badge tone={a.quantity <= 0 ? 'danger' : 'warning'}>
                      {a.quantity <= 0 ? 'Out of stock' : `${a.quantity} left`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Sales by category (month)</CardTitle>
          </CardHeader>
          <CardContent>
            {d.categories.length === 0 ? (
              <p className="py-12 text-center text-sm text-ink-muted">Add items to see categories.</p>
            ) : (
              <ul className="space-y-2.5">
                {d.categories.map((c) => (
                  <li key={c.value}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/inventory/store/items?category=${c.value}`} className="flex items-center gap-2 text-ink hover:underline">
                        <span className="size-2.5 rounded-full" style={{ background: c.colour }} aria-hidden />
                        {c.label}
                        <span className="text-xs text-ink-subtle">{c.items} items</span>
                      </Link>
                      <span className="tnum">{formatMoney(c.salesMinor, currency)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${(c.salesMinor / catMax) * 100}%`, background: c.colour }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best sellers (month)</CardTitle>
          </CardHeader>
          <CardContent>
            {d.topItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-ink-muted">No sales this month yet.</p>
            ) : (
              <ol className="space-y-2">
                {d.topItems.map((t, i) => (
                  <li key={t.description} className="flex items-center gap-3 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{t.description}</span>
                    <span className="text-xs text-ink-subtle tnum">{t.quantity} sold</span>
                    <span className="tnum font-medium text-ink">{formatMoney(t.amountMinor, currency)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent bills</CardTitle>
            <Link href="/inventory/store/sales" className="text-xs text-[var(--brand-600)] hover:underline">
              All bills
            </Link>
          </CardHeader>
          <CardContent>
            {d.recent.length === 0 ? (
              <div className="py-10 text-center">
                <Boxes className="mx-auto size-8 text-ink-subtle" aria-hidden />
                <p className="mt-2 text-sm text-ink-muted">No bills yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {d.recent.map((s) => (
                  <li key={s.id}>
                    <Link href={`/inventory/store/sales/${s.id}`} className="flex items-center justify-between gap-2 py-2 hover:bg-surface-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{s.customerName ?? 'Walk-in'}</p>
                        <p className="text-xs text-ink-subtle">{s.number} · {TIME.format(s.soldAt)} · {storePaymentLabel(s.paymentMode)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium tnum text-ink">{formatMoney(s.totalMinor, currency)}</p>
                        {s.status === 'VOIDED' ? <StatusBadge status="VOIDED" tone="danger" /> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
