import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { DocumentAction } from '@/components/accounting/payables-forms'
import { DisposeAssetDialog, EditFixedAssetDialog } from '@/components/accounting/fixed-asset-forms'
import { formatDay } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'
import { ApiException } from '@/server/api/response'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { cashBankAccounts } from '@/server/modules/accounting/cash-bank'
import { getFixedAsset } from '@/server/modules/accounting/fixed-assets-service'
import { formatRate, lifeEndDate } from '@/server/modules/accounting/fixed-assets'
import { AccountsTabs, Metric, moneyFmt } from '../../ui'

export const metadata = { title: 'Fixed asset' }

function day(iso: string) {
  return formatDay(new Date(`${iso}T00:00:00Z`))
}

const RUN_TONE = { POSTED: 'success', SUBMITTED: 'warning', REJECTED: 'neutral', REVERSED: 'neutral' } as const

export default async function FixedAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('accounts.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Fixed asset" />
        <AccountsTabs active="/accounts/fixed-assets" />
        <Notice tone="info" title="Not enabled">Fixed asset accounting is switched off for this school.</Notice>
      </div>
    )
  }
  const { id } = await params
  const data = await getFixedAsset(ctx, id).catch((e: unknown) => {
    if (e instanceof ApiException && e.status === 404) return null
    throw e
  })
  if (!data) notFound()
  const { asset: a } = data
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const canManage = ctx.can('accounts.manage')
  const ledger = (accountId: string | null) => {
    const l = accountId ? data.accounts[accountId] : null
    return l ? `${l.code} · ${l.name}` : '—'
  }
  const postedLines = data.lines.filter((l) => l.run.status === 'POSTED')
  const hasHistory = postedLines.length > 0 || data.rateChanges.length > 0
  const lifeEnd = lifeEndDate(data.terms.depreciationStartOn, a.usefulLifeMonths)
  const cash = canManage && a.status === 'ACTIVE' ? (await cashBankAccounts(ctx.db)).filter((c) => c.isActive) : []
  const details: [string, React.ReactNode][] = [
    ['Category', a.category],
    ['Location', a.location || '—'],
    ['Department', a.department || '—'],
    ['Capitalised on', formatDay(a.capitalisedOn)],
    ['Depreciation from', formatDay(a.depreciationStartOn)],
    ['Method', `Written-down value at ${formatRate(data.terms.rates.at(-1)?.rateBp ?? a.rateBp)} a year`],
    ['Useful life', lifeEnd ? `${+((a.usefulLifeMonths ?? 0) / 12).toFixed(2)} years (to ${day(lifeEnd)})` : 'Not set'],
    ['Residual value', money(a.residualMinor)],
    ['Asset ledger', ledger(a.assetAccountId)],
    ['Cost in the books', a.capitalisation === 'POSTED' ? `Posted from ${ledger(a.fundingAccountId)}` : 'Already in the books'],
    ['Brought forward depreciation', money(a.openingAccumulatedMinor)],
    ['Depreciated through', data.depreciatedThrough < data.terms.depreciationStartOn ? 'Not yet depreciated' : day(data.depreciatedThrough)],
    ['Inventory item', data.inventory ? `${data.inventory.assetCode} · ${data.inventory.name}` : '—'],
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title={a.name}
        description={`${a.code} · ${a.status === 'ACTIVE' ? 'In use' : a.status === 'DISPOSED' ? 'Disposed' : 'Cancelled'}`}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              {a.status === 'ACTIVE' ? (
                <>
                  <EditFixedAssetDialog
                    asset={{ id: a.id, name: a.name, category: a.category, location: a.location, department: a.department, notes: a.notes, rateBp: data.terms.rates.at(-1)?.rateBp ?? a.rateBp, residualMinor: a.residualMinor, usefulLifeMonths: a.usefulLifeMonths }}
                    hasPosted={hasHistory}
                    termsLocked={data.pendingRun}
                  />
                  {!data.pendingRun ? (
                    <DisposeAssetDialog assetId={a.id} cashAccounts={cash.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }))} today={schoolToday()} />
                  ) : null}
                  {data.lines.length === 0 ? <DocumentAction url={`/api/v1/accounting/fixed-assets/${a.id}`} action="cancel" label="Cancel asset" needsReason variant="danger" /> : null}
                </>
              ) : null}
              {a.status === 'DISPOSED' ? (
                <DocumentAction url={`/api/v1/accounting/fixed-assets/${a.id}`} action="reverse-disposal" label="Reverse disposal" needsReason variant="danger" />
              ) : null}
            </div>
          ) : null
        }
      />
      <AccountsTabs active="/accounts/fixed-assets" />
      <p className="text-sm"><Link href="/accounts/fixed-assets" className="text-[var(--brand-600)] hover:underline">← Fixed assets</Link></p>

      {data.pendingRun ? <Notice tone="warning">This asset is in a depreciation run awaiting approval. Its terms and disposal are locked until that run is decided.</Notice> : null}
      {data.fullyDepreciated && a.status === 'ACTIVE' ? <Notice tone="info">Fully depreciated down to its residual value. No further depreciation will be charged.</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Cost" value={money(a.costMinor)} />
        <Metric label="Accumulated depreciation" value={money(data.accumulatedMinor)} />
        <Metric label="Written-down value" value={money(data.wdvMinor)} tone="success" />
        <Metric label="Residual value" value={money(a.residualMinor)} hint="depreciation stops here" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {details.map(([k, v]) => [
                <dt key={`${k}-k`} className="text-ink-muted">{k}</dt>,
                <dd key={`${k}-v`} className="text-ink">{v}</dd>,
              ])}
            </dl>
            {a.notes ? <p className="mt-3 text-sm text-ink-muted whitespace-pre-line">{a.notes}</p> : null}
          </CardContent>
        </Card>

        {a.status !== 'ACTIVE' ? (
          <Card>
            <CardHeader><CardTitle>{a.status === 'DISPOSED' ? 'Disposal' : 'Cancellation'}</CardTitle></CardHeader>
            <CardContent>
              {a.status === 'DISPOSED' ? (
                <dl className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-ink-muted">Disposed on</dt><dd>{a.disposedOn ? formatDay(a.disposedOn) : '—'}</dd>
                  <dt className="text-ink-muted">Proceeds</dt><dd>{money(a.disposalProceedsMinor ?? 0)}{a.disposalAccountId ? ` into ${ledger(a.disposalAccountId)}` : ''}</dd>
                  <dt className="text-ink-muted">Final depreciation</dt><dd>{money(a.disposalDepreciationMinor ?? 0)}</dd>
                  <dt className="text-ink-muted">{(a.disposalGainLossMinor ?? 0) >= 0 ? 'Gain' : 'Loss'}</dt><dd>{money(a.disposalGainLossMinor ?? 0)}</dd>
                  <dt className="text-ink-muted">Reason</dt><dd>{a.disposalReason ?? '—'}</dd>
                </dl>
              ) : (
                <p className="text-sm">{a.cancelReason ?? 'Cancelled'}{a.cancelledAt ? ` · ${formatDay(a.cancelledAt)}` : ''}</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Projected {data.frequency === 'MONTHLY' ? 'next 12 months' : 'next 5 years'}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {data.projection.length === 0 ? <EmptyState title="Nothing left to depreciate" /> : (
                <TableWrap>
                  <Table>
                    <THead><tr><TH>Period</TH><TH align="right">Rate</TH><TH align="right">Depreciation</TH><TH align="right">Closing WDV</TH></tr></THead>
                    <TBody>
                      {data.projection.map((p) => (
                        <TR key={`${p.fromDate}-${p.toDate}`}>
                          <TD className="text-sm">{day(p.fromDate)} – {day(p.toDate)}{p.lifeEnd ? <span className="block text-xs text-ink-subtle">end of useful life</span> : null}</TD>
                          <TD align="right">{formatRate(p.rateBp)}</TD>
                          <TD align="right">{money(p.amountMinor)}</TD>
                          <TD align="right">{money(p.closingWdvMinor)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
              <p className="p-4 pt-2 text-xs text-ink-subtle">An estimate at current terms. Only posted runs change the books.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Depreciation schedule</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.lines.length === 0 ? <EmptyState title="No depreciation charged yet" /> : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Run</TH>
                    <TH>Period</TH>
                    <TH>Financial year</TH>
                    <TH align="right">Days</TH>
                    <TH align="right">Rate</TH>
                    <TH align="right">Opening WDV</TH>
                    <TH align="right">Depreciation</TH>
                    <TH align="right">Closing WDV</TH>
                  </tr>
                </THead>
                <TBody>
                  {data.lines.map((l) => (
                    <TR key={l.id} className={l.run.status === 'POSTED' ? undefined : 'opacity-60'}>
                      <TD>
                        <Link href={`/accounts/fixed-assets/depreciation?run=${l.run.id}`} className="text-[var(--brand-600)] hover:underline">{l.run.number}</Link>
                        <span className="block"><Badge tone={RUN_TONE[l.run.status]}>{l.run.status.toLowerCase()}</Badge></span>
                      </TD>
                      <TD className="text-sm">{formatDay(l.fromDate)} – {formatDay(l.toDate)}{l.lifeEnd ? <span className="block text-xs text-ink-subtle">end of useful life</span> : null}</TD>
                      <TD className="text-sm">{l.fiscalYearLabel}<span className="block text-xs text-ink-subtle">opening {money(l.fyOpeningWdvMinor)}</span></TD>
                      <TD align="right">{l.chargeableDays}</TD>
                      <TD align="right">{formatRate(l.rateBp)}</TD>
                      <TD align="right">{money(l.openingWdvMinor)}</TD>
                      <TD align="right" className="text-ink">{money(l.amountMinor)}</TD>
                      <TD align="right">{money(l.closingWdvMinor)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Rate history</CardTitle></CardHeader>
          <CardContent className="p-0">
            <TableWrap>
              <Table>
                <THead><tr><TH>From</TH><TH align="right">Rate</TH><TH>Reason</TH></tr></THead>
                <TBody>
                  <TR>
                    <TD>{formatDay(a.depreciationStartOn)}</TD>
                    <TD align="right">{formatRate(data.rateChanges[0]?.previousRateBp ?? a.rateBp)}</TD>
                    <TD className="text-sm text-ink-muted">Original rate</TD>
                  </TR>
                  {data.rateChanges.map((c) => (
                    <TR key={c.id}>
                      <TD>{formatDay(c.effectiveFrom)}</TD>
                      <TD align="right">{formatRate(c.rateBp)}</TD>
                      <TD className="text-sm">{c.reason}<span className="block text-xs text-ink-subtle">{c.changedByLabel} · {formatDay(c.createdAt)}</span></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Journal entries</CardTitle></CardHeader>
          <CardContent className="p-0">
            {data.entries.length === 0 ? (
              <EmptyState title="No asset journals" description="Capitalisation, disposal and their reversals appear here. Depreciation is posted per run." />
            ) : (
              <TableWrap>
                <Table>
                  <THead><tr><TH>Entry</TH><TH>Date</TH><TH>Narration</TH><TH align="right">Amount</TH></tr></THead>
                  <TBody>
                    {data.entries.map((e) => (
                      <TR key={e.id}>
                        <TD>
                          <Link href={`/accounts/journals/${e.id}`} className="text-[var(--brand-600)] hover:underline">{e.number}</Link>
                          {e.isReversal ? <span className="block text-xs text-ink-subtle">reversal</span> : e.reversedAt ? <span className="block text-xs text-ink-subtle">reversed</span> : null}
                        </TD>
                        <TD>{formatDay(e.date)}</TD>
                        <TD className="text-sm">{e.narration}</TD>
                        <TD align="right">{money(e.totalMinor)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}