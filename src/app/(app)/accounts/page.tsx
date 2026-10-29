import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Notice, EmptyState } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { formatDay } from '@/lib/dates'
import { accountBalances, defaultRange, getPostingSetup, listJournals } from '@/server/modules/accounts/service'
import { naturalBalance } from '@/server/modules/accounts/math'
import { viewedPeriodOr } from '@/server/view-session'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { myPendingApprovalActions } from '@/server/modules/accounting/expense-approval-service'
import { myJournalApprovalCount } from '@/server/modules/accounting/journal-approval-service'
import { STATUS_LABEL } from '@/server/modules/accounting/expense-approval'
import { syncBooksAction } from './actions'
import { drillHref, type Drill } from '@/server/drill/descriptor'
import { AccountsTabs, Metric, moneyFmt, SOURCE_LABEL } from './ui'

export const metadata = { title: 'Accounts & Ledger' }

export default async function AccountsOverviewPage() {
  const ctx = await requireContext('accounts.view')
  const range = await viewedPeriodOr(ctx, defaultRange())
  const [balances, setup, recent, flags, pendingActions, entriesForMe] = await Promise.all([
    accountBalances(ctx, range),
    getPostingSetup(ctx),
    listJournals(ctx, {}, 1, 10),
    getAccountingFlags(ctx.db),
    myPendingApprovalActions(ctx),
    myJournalApprovalCount(ctx),
  ])
  const { money } = moneyFmt(ctx.tenant.currency || 'INR')
  const sumOf = (pred: (r: (typeof balances)[number]) => boolean, f: (r: (typeof balances)[number]) => number) =>
    balances.filter(pred).reduce((t, r) => t + f(r), 0)

  const cash = sumOf((r) => r.systemKey === 'CASH', (r) => r.closingMinor)
  // Bank = the default bank account plus any account a collection mode posts to.
  const bankIds = new Set(setup.modes.map((m) => m.accountId).filter(Boolean))
  const bank = sumOf(
    (r) => r.type === 'ASSET' && r.systemKey !== 'CASH' && (r.systemKey === 'BANK' || bankIds.has(r.id)),
    (r) => r.closingMinor,
  )
  const income = sumOf((r) => r.type === 'INCOME', (r) => naturalBalance('INCOME', r.debitMinor - r.creditMinor))
  const expense = sumOf((r) => r.type === 'EXPENSE', (r) => naturalBalance('EXPENSE', r.debitMinor - r.creditMinor))
  const advance = sumOf((r) => r.systemKey === 'ADVANCE_FEES', (r) => -r.closingMinor)
  const canManage = ctx.can('accounts.manage')
  const cashAccounts = balances.filter((r) => r.systemKey === 'CASH')
  const cashAccount = cashAccounts.length === 1 ? cashAccounts[0] : undefined
  const drill = (d: Drill) => drillHref(ctx.tenant.id, d)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts & Ledger"
        description={`Double-entry books for ${range.from} to ${range.to}. Fee receipts, refunds and expenses post automatically.`}
        actions={
          canManage ? (
            <Link href="/accounts/journals/new">
              <Button size="sm">New journal voucher</Button>
            </Link>
          ) : null
        }
      />
      <AccountsTabs active="/accounts" />

      {setup.tallyEnabled ? (
        <Notice tone="info" title="Tally is connected">
          Tally stays your official books. These internal books mirror the same receipts so you can see cash, bank,
          income and dues without opening Tally. You can switch automatic posting off in Posting rules.
        </Notice>
      ) : null}

      {setup.entryCount === 0 ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Your books are empty</p>
              <p className="text-sm text-ink-muted">
                Post every existing fee receipt, refund and expense into the books in one go. Safe to run more than once.
              </p>
            </div>
            {canManage ? (
              <form action={syncBooksAction}>
                <input type="hidden" name="full" value="1" />
                <Button type="submit">Build books from existing records</Button>
              </form>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          label="Cash in hand"
          value={money(cash)}
          hint={cash < 0 ? 'Credit balance — check entries' : undefined}
          href={cashAccount ? drill({ k: 'ledger', a: cashAccount.id, f: range.from, t: range.to, v: 'closing' }) : undefined}
        />
        <Metric label="Bank balance" value={money(bank)} href={flags.module ? `/accounts/bank-book?from=${range.from}&to=${range.to}` : undefined} />
        <Metric label="Income (this FY)" value={money(income)} href={drill({ k: 'group', g: 'income', f: range.from, t: range.to })} />
        <Metric label="Expenses (this FY)" value={money(expense)} href={drill({ k: 'group', g: 'expenses', f: range.from, t: range.to })} />
        <Metric
          label="Surplus (this FY)"
          value={`${income - expense < 0 ? '−' : ''}${money(income - expense)}`}
          tone={income - expense >= 0 ? 'success' : 'danger'}
          hint={advance > 0 ? `${money(advance)} held as advance fees` : undefined}
          href={drill({ k: 'surplus', l: 'net', f: range.from, t: range.to })}
        />
      </div>

      {entriesForMe > 0 ? (
        <Notice tone="warning" title={`${entriesForMe} ${entriesForMe === 1 ? 'entry is' : 'entries are'} waiting for your approval`}>
          Bills, stock purchases, payroll and other cost entries stay out of Profit &amp; loss and the Balance sheet until approved.{' '}
          <Link href="/accounts/approvals?view=mine" className="font-medium underline">Open entry approvals</Link>
        </Notice>
      ) : null}

      {pendingActions && pendingActions.awaitingCount + pendingActions.returnedCount > 0 ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-base font-semibold">My pending actions</h2>
            <Link href="/accounts/expense-approvals?view=board" className="text-sm font-medium text-[var(--brand-600)] hover:underline">
              Approval board
            </Link>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {[...pendingActions.awaiting, ...pendingActions.returned].map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <Link href={`/accounts/expense-approvals/${p.id}`} className="font-medium text-[var(--brand-600)] hover:underline">
                  {p.title}
                  <span className="ml-2 text-xs font-normal text-ink-subtle">{p.number}</span>
                </Link>
                <span className="flex items-center gap-3">
                  <Badge tone={p.status === 'RETURNED' || p.status === 'DRAFT' ? 'info' : 'warning'}>{STATUS_LABEL[p.status]}</Badge>
                  <span className="tnum">{money(p.amountMinor)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-ink-subtle">
            {pendingActions.awaitingCount} awaiting your sign-off · {pendingActions.returnedCount} draft or returned to you
          </p>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Recent vouchers</h2>
          <Link href="/accounts/journals" className="text-sm font-medium text-[var(--brand-600)] hover:underline">
            All journal entries
          </Link>
        </div>
        {recent.rows.length === 0 ? (
          <EmptyState title="No vouchers yet" description="Collect a fee or record an expense and it will appear here." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Voucher</TH>
                  <TH>Date</TH>
                  <TH>Source</TH>
                  <TH>Narration</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {recent.rows.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <Link href={`/accounts/journals/${e.id}`} className="font-medium text-[var(--brand-600)] hover:underline">
                        {e.number}
                      </Link>
                    </TD>
                    <TD>{formatDay(e.date)}</TD>
                    <TD>
                      <Badge tone={e.isReversal ? 'warning' : 'neutral'}>
                        {e.isReversal ? 'Reversal' : SOURCE_LABEL[e.sourceType]}
                      </Badge>
                    </TD>
                    <TD className="max-w-96 truncate" title={e.narration ?? undefined}>{e.narration}</TD>
                    <TD align="right">{money(e.totalMinor)}</TD>
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
