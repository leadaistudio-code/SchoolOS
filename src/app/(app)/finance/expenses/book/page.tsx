import Link from 'next/link'
import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { paymentModeLabel } from '@/lib/finance/expense-options'
import { getExpenseBook, EXPENSE_BOOK_ROW_LIMIT } from '@/server/modules/finance/expense-book'
import { expenseHeadOptions } from '@/server/modules/finance/expense-heads'
import { accountingEnvSwitches, getAccountingFlags } from '@/server/modules/accounting/service'
import { approvalMode } from '@/server/modules/accounting/flags'
import { NewExpenseButton } from '../expense-forms'

export const metadata = { title: 'Expense Book' }

function day(iso: string) {
  return formatDay(new Date(`${iso}T00:00:00Z`))
}

export default async function ExpenseBookPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('expenses.view')
  const params = await searchParams
  const canManage = ctx.can('expenses.manage')
  const [book, flags, heads] = await Promise.all([
    getExpenseBook(ctx, params),
    getAccountingFlags(ctx.db),
    canManage ? expenseHeadOptions(ctx) : Promise.resolve([]),
  ])
  const mode = approvalMode(flags, accountingEnvSwitches().approvals)
  const money = (minor: number) => formatMoney(minor, ctx.tenant.currency)
  const dayTotals = new Map(book.days.map((d) => [d.date, d]))
  const byDay = new Map<string, typeof book.rows>()
  for (const r of book.rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r])
  const exportQs = new URLSearchParams({ from: book.from, to: book.to }).toString()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expense Book"
        description={`Day-wise register of every expense · ${day(book.from)} to ${day(book.to)}`}
        actions={
          <>
            <Link href="/finance/expenses" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>All expenses</Link>
            <a href={`/api/v1/finance/expenses/export?${exportQs}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Download CSV</a>
            {canManage ? (
              <NewExpenseButton heads={heads} approvals={mode === 'mandatory'} canSendForApproval={mode === 'optional'} label="Quick entry" />
            ) : null}
          </>
        }
      />

      <Card className="no-print p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-ink-muted">From</span>
            <Input type="date" name="from" defaultValue={book.from} className="mt-1 w-44" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">To</span>
            <Input type="date" name="to" defaultValue={book.to} className="mt-1 w-44" />
          </label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>

      {mode === 'mandatory' ? (
        <Notice tone="info" title="Expense approval is on">Entries reach this book only after final approval.</Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-ink-muted">Total for the period</p>
          <p className="text-2xl font-semibold tnum">{money(book.totalMinor)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-muted">Entries</p>
          <p className="text-2xl font-semibold tnum">{book.count}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-muted">Days with spending</p>
          <p className="text-2xl font-semibold tnum">{book.days.length}</p>
        </Card>
      </div>

      {book.truncated ? (
        <Notice tone="warning">Showing the first {EXPENSE_BOOK_ROW_LIMIT} entries; the totals above cover the whole period. Choose a shorter period to see every entry.</Notice>
      ) : null}

      <Card className="overflow-hidden">
        {book.rows.length === 0 ? (
          <EmptyState title="No expenses in this period" description={canManage ? 'Use Quick entry to record one.' : 'Choose another period.'} />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Voucher</TH>
                  <TH>Particulars</TH>
                  <TH>Head</TH>
                  <TH>Mode</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {[...byDay.entries()].map(([date, rows]) => {
                  const t = dayTotals.get(date)!
                  return [
                    <TR key={`h-${date}`} className="bg-surface-2">
                      <TD colSpan={4} className="font-semibold text-ink">
                        {day(date)}
                        <span className="ml-2 text-xs font-normal text-ink-subtle">
                          {t.count} {t.count === 1 ? 'entry' : 'entries'} · direct {money(t.directMinor)} · indirect {money(t.indirectMinor)} · running {money(t.cumulativeMinor)}
                        </span>
                      </TD>
                      <TD align="right" className="tnum font-semibold">{money(t.totalMinor)}</TD>
                    </TR>,
                    ...rows.map((r) => (
                      <TR key={r.id}>
                        <TD className="whitespace-nowrap text-sm">{r.voucherNumber ?? '—'}</TD>
                        <TD>
                          <span className="font-medium text-ink">{r.title}</span>
                          {r.vendor ? <span className="block text-xs text-ink-subtle">{r.vendor}{r.referenceNo ? ` · ${r.referenceNo}` : ''}</span> : null}
                        </TD>
                        <TD className="text-sm">
                          {r.head?.name ?? '—'} <Badge tone={r.nature === 'DIRECT' ? 'brand' : 'neutral'}>{r.nature === 'DIRECT' ? 'Direct' : 'Indirect'}</Badge>
                        </TD>
                        <TD className="text-sm">{paymentModeLabel(r.paymentMode)}</TD>
                        <TD align="right" className="tnum">{money(r.amountMinor)}</TD>
                      </TR>
                    )),
                  ]
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
