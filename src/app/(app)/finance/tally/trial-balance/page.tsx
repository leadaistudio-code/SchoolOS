import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice, EmptyState } from '@/components/ui/states'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { ArrowDownLeft, ArrowUpRight, CalendarRange, Scale } from 'lucide-react'
import { ACCENT, StatCard } from '@/components/ui/stat-card'
import {
  defaultPeriod,
  getTrialBalanceView,
  type MatchRow,
  type TrialBalanceRow,
} from '@/server/modules/tally/trial-balance'
import { requestTrialBalanceAction } from '../actions'

export const metadata = { title: 'Tally Trial Balance' }

const STATUS: Record<MatchRow['status'], { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  MATCHED: { label: 'Matched', tone: 'success' },
  NOT_POSTED: { label: 'Not yet posted', tone: 'warning' },
  MISMATCH: { label: 'Mismatch', tone: 'danger' },
  MISSING_IN_TALLY: { label: 'Ledger not in Tally', tone: 'danger' },
}

export default async function TallyTrialBalancePage() {
  const ctx = await requireContext('fees.tally')
  const canManage = ctx.can('fees.tally_manage')
  const view = await getTrialBalanceView(ctx)
  const tb = view.trialBalance
  const currency = ctx.tenant.currency || 'INR'
  const money = (minor: number) => formatMoney(Math.abs(minor), currency)
  const drCr = (minor: number) => (minor === 0 ? '—' : `${money(minor)} ${minor > 0 ? 'Dr' : 'Cr'}`)
  const period = tb ? { from: tb.fromDate, to: tb.toDate } : defaultPeriod()

  const groups = new Map<string, TrialBalanceRow[]>()
  for (const row of tb?.rows ?? []) groups.set(row.primaryGroup, [...(groups.get(row.primaryGroup) ?? []), row])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tally Trial Balance"
        description="Ledger balances read from Tally, matched against fees collected in MyCampusView for the same period."
        actions={
          <div className="flex items-center gap-3 text-sm">
            {tb ? (
              <a
                href="/api/v1/tally/trial-balance/export"
                className="font-medium text-[var(--brand-600)] hover:underline"
              >
                Download CSV
              </a>
            ) : null}
            <Link href="/finance/tally" className="font-medium text-[var(--brand-600)] hover:underline">
              Sync Center
            </Link>
          </div>
        }
      />

      {canManage ? (
        <Card className="p-4">
          <form action={requestTrialBalanceAction} className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-ink-muted">From</span>
              <Input type="date" name="from" defaultValue={period.from} required className="mt-1 w-44" />
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">To</span>
              <Input type="date" name="to" defaultValue={period.to} required className="mt-1 w-44" />
            </label>
            <Button type="submit">Fetch trial balance from Tally</Button>
          </form>
          <p className="mt-2 text-xs text-ink-subtle">
            Read-only. The connector reads balances from the company open in Tally; nothing is written to Tally.
          </p>
        </Card>
      ) : null}

      {view.request?.status === 'FAILED' ? (
        <Notice tone="danger" title="The last trial balance request failed">
          {view.request.error ?? 'The connector could not read balances from Tally.'}
        </Notice>
      ) : view.request ? (
        <Notice tone="info" title="Waiting for the Tally connector">
          Requested {view.request.createdAt.toLocaleString('en-IN')}. Keep Tally open with the company loaded, then
          refresh this page in a few seconds.
        </Notice>
      ) : null}

      {!tb ? (
        <Card>
          <EmptyState
            title="No trial balance yet"
            description="Choose a period and fetch the trial balance. The Tally connector must be online."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Period"
              value={`${tb.fromDate} → ${tb.toDate}`}
              icon={CalendarRange}
              accent={ACCENT.indigo}
              hint={`${tb.rows.length} ledgers`}
            />
            <StatCard
              label="Total debit"
              value={money(tb.totals.closingDrMinor)}
              icon={ArrowDownLeft}
              accent={ACCENT.sky}
              hint="Closing Dr balances"
            />
            <StatCard
              label="Total credit"
              value={money(tb.totals.closingCrMinor)}
              icon={ArrowUpRight}
              accent={ACCENT.violet}
              hint="Closing Cr balances"
            />
            <StatCard
              label="Balanced"
              value={tb.totals.differenceMinor === 0 ? 'Yes' : `Off by ${drCr(tb.totals.differenceMinor)}`}
              icon={Scale}
              accent={tb.totals.differenceMinor === 0 ? ACCENT.emerald : ACCENT.rose}
              tone={tb.totals.differenceMinor === 0 ? 'success' : 'danger'}
              hint={tb.totals.differenceMinor === 0 ? 'Debits equal credits' : 'Check opening balances in Tally'}
            />
          </div>
          {view.fetchedAt ? (
            <p className="text-xs text-ink-subtle">
              Fetched from Tally {view.fetchedAt.toLocaleString('en-IN')} · {tb.rows.length} ledgers
            </p>
          ) : null}

          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-base font-semibold">MyCampusView vs Tally</h2>
              <p className="text-sm text-ink-muted">
                Movement on each mapped ledger in this period compared with fees collected in MyCampusView.
              </p>
            </div>
            {view.matches.length === 0 ? (
              <EmptyState
                title="Nothing to match"
                description="Map fee heads and payment modes to Tally ledgers in the Sync Center first."
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Tally ledger</TH>
                      <TH>Side</TH>
                      <TH>Based on</TH>
                      <TH align="right">MyCampusView</TH>
                      <TH align="right">Posted to Tally</TH>
                      <TH align="right">Tally movement</TH>
                      <TH align="right">Difference</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {view.matches.map((m) => (
                      <TR key={`${m.side}:${m.ledgerName}`}>
                        <TD className="font-medium text-ink">{m.ledgerName}</TD>
                        <TD>{m.side === 'CREDIT' ? 'Fee income (Cr)' : 'Collection (Dr)'}</TD>
                        <TD className="max-w-64 truncate" title={m.basis}>
                          {m.basis}
                        </TD>
                        <TD align="right">{money(m.mcvMinor)}</TD>
                        <TD align="right">{money(m.postedMinor)}</TD>
                        <TD align="right">{m.tallyMinor == null ? '—' : money(m.tallyMinor)}</TD>
                        <TD align="right" className={m.differenceMinor !== 0 ? 'text-ink' : undefined}>
                          {m.differenceMinor === 0 ? '—' : `${m.differenceMinor > 0 ? '+' : '−'}${money(m.differenceMinor)}`}
                        </TD>
                        <TD>
                          <Badge tone={STATUS[m.status].tone} dot>
                            {STATUS[m.status].label}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
            {view.summary ? (
              <div className="space-y-1 border-t border-[var(--border)] px-4 py-3 text-xs text-ink-muted">
                <p>
                  {view.summary.paymentCount} fee payments in this period · {view.summary.postedCount} posted to Tally.
                  Difference = Tally − MyCampusView.
                </p>
                {view.summary.unmappedFeeMinor > 0 ? (
                  <p>{money(view.summary.unmappedFeeMinor)} was collected against fee heads with no Tally ledger mapped.</p>
                ) : null}
                {view.summary.unallocatedMinor > 0 ? (
                  <p>{money(view.summary.unallocatedMinor)} was collected without an invoice line (advance or credit).</p>
                ) : null}
                {view.summary.noDebitLedgerMinor > 0 ? (
                  <p>{money(view.summary.noDebitLedgerMinor)} was collected by payment modes with no Tally ledger rule.</p>
                ) : null}
                <p>
                  Cash and bank ledgers also carry non-fee entries (expenses, transfers, other income), so a difference on
                  the Collection side is normal; fee income ledgers should match exactly.
                </p>
              </div>
            ) : null}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-base font-semibold">Trial balance</h2>
              <p className="text-sm text-ink-muted">As read from Tally, grouped by primary group.</p>
            </div>
            <TableWrap sticky>
              <Table>
                <THead sticky>
                  <tr>
                    <TH>Ledger</TH>
                    <TH>Group</TH>
                    <TH align="right">Opening</TH>
                    <TH align="right">Net change</TH>
                    <TH align="right">Closing Dr</TH>
                    <TH align="right">Closing Cr</TH>
                  </tr>
                </THead>
                <TBody>
                  {[...groups.entries()].map(([primary, rows]) => {
                    const dr = rows.reduce((t, r) => t + Math.max(0, r.closingMinor), 0)
                    const cr = rows.reduce((t, r) => t + Math.max(0, -r.closingMinor), 0)
                    return [
                      <tr key={`g:${primary}`} className="bg-surface-2">
                        <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-ink">
                          {primary}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-ink tnum">{dr ? money(dr) : ''}</td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-ink tnum">{cr ? money(cr) : ''}</td>
                      </tr>,
                      ...rows.map((r) => (
                        <TR key={`l:${r.name}`}>
                          <TD className="pl-6 text-ink">{r.name}</TD>
                          <TD>{r.group}</TD>
                          <TD align="right">{drCr(r.openingMinor)}</TD>
                          <TD align="right">{drCr(r.changeMinor)}</TD>
                          <TD align="right">{r.closingMinor > 0 ? money(r.closingMinor) : ''}</TD>
                          <TD align="right">{r.closingMinor < 0 ? money(r.closingMinor) : ''}</TD>
                        </TR>
                      )),
                    ]
                  })}
                  <tr className="border-t-2 border-line-strong">
                    <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-ink">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-ink tnum">
                      {money(tb.totals.closingDrMinor)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-ink tnum">
                      {money(tb.totals.closingCrMinor)}
                    </td>
                  </tr>
                </TBody>
              </Table>
            </TableWrap>
          </Card>
        </>
      )}
    </div>
  )
}
