import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { FixedAssetDialog } from '@/components/accounting/fixed-asset-forms'
import { formatDay } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { fixedAssetFormOptions, fixedAssetReconciliation, listFixedAssets } from '@/server/modules/accounting/fixed-assets-service'
import { formatRate } from '@/server/modules/accounting/fixed-assets'
import { toIsoDay } from '@/server/modules/accounting/fiscal-year'
import { AccountsTabs, Metric, moneyFmt } from '../ui'

export const metadata = { title: 'Fixed assets' }

const STATUS_TONE = { ACTIVE: 'success', DISPOSED: 'neutral', CANCELLED: 'danger' } as const

export default async function FixedAssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('accounts.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Fixed assets" />
        <AccountsTabs active="/accounts/fixed-assets" />
        <Notice tone="info" title="Not enabled">Fixed asset accounting is switched off for this school.</Notice>
      </div>
    )
  }
  const params = await searchParams
  const canManage = ctx.can('accounts.manage')
  const [list, rec, options] = await Promise.all([
    listFixedAssets(ctx, params),
    fixedAssetReconciliation(ctx, params.asOf),
    canManage ? fixedAssetFormOptions(ctx) : Promise.resolve(null),
  ])
  const toCapitalise = options && params.capitalise
    ? await ctx.db.asset.findFirst({
        where: { id: params.capitalise, deletedAt: null },
        select: { id: true, name: true, location: true, purchaseDate: true, purchasePriceMinor: true },
      })
    : null
  const prefill = toCapitalise
    ? {
        inventoryAssetId: toCapitalise.id,
        name: toCapitalise.name,
        location: toCapitalise.location,
        capitalisedOn: toCapitalise.purchaseDate ? toIsoDay(toCapitalise.purchaseDate) : null,
        costMinor: toCapitalise.purchasePriceMinor,
      }
    : undefined
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const ledger = (id: string | null) => {
    const a = id ? rec.accounts[id] : null
    return a ? `${a.code} · ${a.name}` : 'Not created yet'
  }
  const label = (a: { code: string; name: string }) => `${a.code} · ${a.name}`

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fixed assets"
        description="Register, written-down values and depreciation"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/accounts/fixed-assets/depreciation"><Button size="sm" variant="secondary">Depreciation runs</Button></Link>
            {options ? (
              <FixedAssetDialog
                assetLedgers={options.assetLedgers.map((a) => ({ id: a.id, label: label(a) }))}
                funding={options.funding.map((a) => ({ id: a.id, label: label(a) }))}
                inventory={options.inventory.map((i) => ({ id: i.id, label: `${i.assetCode} · ${i.name}` }))}
                categories={list.categories}
                defaultAssetLedgerId={options.assetLedgers.find((a) => a.systemKey === 'FIXED_ASSETS')?.id ?? options.assetLedgers[0]?.id ?? null}
                today={schoolToday()}
                prefill={prefill}
              />
            ) : null}
          </div>
        }
      />
      <AccountsTabs active="/accounts/fixed-assets" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Assets in use" value={String(list.totals.assets)} />
        <Metric label="Cost" value={money(list.totals.costMinor)} hint="of assets in use" />
        <Metric label="Accumulated depreciation" value={money(list.totals.accumulatedMinor)} hint="brought forward + posted runs" />
        <Metric label="Written-down value" value={money(list.totals.wdvMinor)} tone="success" />
      </div>

      <Card className="no-print p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-ink-muted">Status</span>
            <Select name="status" defaultValue={list.filter.status} className="mt-1 w-36">
              <option value="ACTIVE">In use</option>
              <option value="DISPOSED">Disposed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="all">All</option>
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Category</span>
            <Select name="category" defaultValue={list.filter.category ?? ''} className="mt-1 w-44">
              <option value="">All categories</option>
              {list.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Search</span>
            <Input name="q" defaultValue={list.filter.q ?? ''} placeholder="Name, code, location" className="mt-1 w-56" />
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Register</CardTitle></CardHeader>
        <CardContent className="p-0">
          {list.rows.length === 0 ? (
            <EmptyState title="No fixed assets" description={canManage ? 'Add furniture, computers, vehicles and other long-lived assets to depreciate them.' : 'Nothing matches these filters.'} />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Asset</TH>
                    <TH>Category / location</TH>
                    <TH>Capitalised</TH>
                    <TH align="right">Rate</TH>
                    <TH align="right">Cost</TH>
                    <TH align="right">Accumulated</TH>
                    <TH align="right">WDV</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {list.rows.map(({ asset: a, accumulatedMinor, wdvMinor }) => (
                    <TR key={a.id}>
                      <TD>
                        <Link href={`/accounts/fixed-assets/${a.id}`} className="font-medium text-[var(--brand-600)] hover:underline">{a.name}</Link>
                        <span className="block text-xs text-ink-subtle">{a.code}</span>
                      </TD>
                      <TD className="text-sm">
                        {a.category}
                        <span className="block text-xs text-ink-subtle">{[a.location, a.department].filter(Boolean).join(' · ') || '—'}</span>
                      </TD>
                      <TD>{formatDay(a.capitalisedOn)}</TD>
                      <TD align="right">{formatRate(a.rateBp)}</TD>
                      <TD align="right">{money(a.costMinor)}</TD>
                      <TD align="right">{money(accumulatedMinor)}</TD>
                      <TD align="right" className="text-ink font-medium">{money(wdvMinor)}</TD>
                      <TD><Badge tone={STATUS_TONE[a.status]}>{a.status === 'ACTIVE' ? 'In use' : a.status === 'DISPOSED' ? 'Disposed' : 'Cancelled'}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
          <Pagination total={list.total} page={list.page} pageSize={list.pageSize} label="assets" />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Register vs ledger as at {formatDay(new Date(`${rec.asOf}T00:00:00Z`))}</CardTitle>
            <form method="get" className="no-print flex items-center gap-2">
              <Input type="date" name="asOf" defaultValue={rec.asOf} className="w-40" aria-label="As at" />
              <Button type="submit" size="sm" variant="secondary">Check</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!rec.matches ? (
            <div className="p-4 pb-0">
              <Notice tone="warning" title="Register and ledgers differ">
                Assets marked as already in the books need their cost and any brought-forward depreciation in these ledgers (purchase voucher, journal or opening balance). Other postings to these ledgers also show here.
              </Notice>
            </div>
          ) : null}
          <TableWrap>
            <Table>
              <THead><tr><TH>Ledger</TH><TH align="right">Register</TH><TH align="right">Ledger</TH><TH align="right">Difference</TH></tr></THead>
              <TBody>
                {rec.cost.map((c) => (
                  <TR key={c.accountId}>
                    <TD>{ledger(c.accountId)} <span className="text-xs text-ink-subtle">cost</span></TD>
                    <TD align="right">{money(c.registerMinor)}</TD>
                    <TD align="right">{money(c.ledgerMinor)}{c.ledgerMinor < 0 ? ' Cr' : ''}</TD>
                    <TD align="right">{c.differenceMinor === 0 ? <Badge tone="success">Matches</Badge> : <Badge tone="danger">{c.differenceMinor < 0 ? '−' : ''}{money(c.differenceMinor)}</Badge>}</TD>
                  </TR>
                ))}
                <TR>
                  <TD>{ledger(rec.accumulated.accountId)} <span className="text-xs text-ink-subtle">credit balance</span></TD>
                  <TD align="right">{money(rec.accumulated.registerMinor)}</TD>
                  <TD align="right">{money(rec.accumulated.ledgerMinor)}</TD>
                  <TD align="right">{rec.accumulated.differenceMinor === 0 ? <Badge tone="success">Matches</Badge> : <Badge tone="danger">{rec.accumulated.differenceMinor < 0 ? '−' : ''}{money(rec.accumulated.differenceMinor)}</Badge>}</TD>
                </TR>
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  )
}
