import Link from 'next/link'
import { Building, Filter, Paperclip, Target, Wallet } from 'lucide-react'
import { ACCENT, StatCard } from '@/components/ui/stat-card'
import { requireContext } from '@/server/context'
import { expenseFilterSchema, expenseOverview, listExpenses } from '@/server/modules/finance/expenses'
import { expenseHeadOptions } from '@/server/modules/finance/expense-heads'
import { natureLabel, paymentModeLabel } from '@/lib/finance/expense-options'
import { parseListQuery } from '@/lib/query'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'
import { EditExpenseButton, NewExpenseButton } from './expense-forms'
import { ExpenseFilters } from './filters'
import { ExpenseChart } from './expense-chart'

export const metadata = { title: 'Expenses' }

const FILTER_KEYS = ['q', 'headId', 'nature', 'paymentMode', 'preset', 'from', 'to', 'category'] as const

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('expenses.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const filter = expenseFilterSchema.parse(params)

  const heads = await expenseHeadOptions(ctx)
  const [list, overview] = await Promise.all([listExpenses(ctx, query, filter), expenseOverview(ctx)])
  const { rows, total, totalMinor } = list
  const canManage = ctx.can('expenses.manage')
  const currency = ctx.tenant.currency
  const filtered = FILTER_KEYS.some((k) => params[k])
  const exportQs = new URLSearchParams(
    FILTER_KEYS.flatMap((k) => (params[k] ? [[k, params[k]!] as [string, string]] : [])),
  ).toString()
  const share = (part: number) => (overview.totalMinor > 0 ? Math.round((part / overview.totalMinor) * 100) : 0)
  const topHeads = overview.byHead.slice(0, 8)
  const topMax = topHeads[0]?.amountMinor ?? 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expense management"
        description="Record every school spend. Each head is a direct or indirect expense, and it flows into the dashboard and the Profit & Loss automatically."
        actions={
          <>
            <a
              href={`/api/v1/finance/expenses/export${exportQs ? `?${exportQs}` : ''}`}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Download CSV
            </a>
            <Link href="/finance/expenses/heads" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Expense heads
            </Link>
            {ctx.can('accounts.view') ? (
              <Link href="/accounts/profit-loss" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                Profit &amp; Loss
              </Link>
            ) : null}
            {canManage ? <NewExpenseButton heads={heads} /> : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Total FY ${overview.fyLabel}`}
          value={formatMoney(overview.totalMinor, currency)}
          hint={`${overview.entries} entries`}
          icon={Wallet}
          accent={ACCENT.rose}
        />
        <StatCard
          label="Direct expenses"
          value={formatMoney(overview.directMinor, currency)}
          hint={`${share(overview.directMinor)}% of spend · teaching delivery`}
          icon={Target}
          accent={ACCENT.indigo}
          href="?nature=DIRECT&preset=fy"
        />
        <StatCard
          label="Indirect expenses"
          value={formatMoney(overview.indirectMinor, currency)}
          hint={`${share(overview.indirectMinor)}% of spend · running costs`}
          icon={Building}
          accent={ACCENT.amber}
          href="?nature=INDIRECT&preset=fy"
        />
        <StatCard
          label={filtered ? 'Filtered total' : 'All-time total'}
          value={formatMoney(totalMinor, currency)}
          hint={`${total} entries · direct ${formatMoney(list.directMinor, currency)} · indirect ${formatMoney(list.indirectMinor, currency)}`}
          icon={Filter}
          accent={ACCENT.teal}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly expenses (FY {overview.fyLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.totalMinor === 0 ? (
              <p className="py-16 text-center text-sm text-ink-muted">No expenses recorded this financial year yet.</p>
            ) : (
              <ExpenseChart data={overview.months} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Expense by head</CardTitle>
            <Link href="/finance/expenses/heads" className="text-xs text-[var(--brand-600)] hover:underline">All heads</Link>
          </CardHeader>
          <CardContent>
            {topHeads.length === 0 ? (
              <p className="py-16 text-center text-sm text-ink-muted">No data yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {topHeads.map((h) => (
                  <li key={`${h.headId}-${h.nature}`}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <Link href={h.headId ? `?headId=${h.headId}&preset=fy` : '#'} className="truncate text-ink hover:text-[var(--brand-600)]">
                        {h.name}
                      </Link>
                      <span className="shrink-0 tnum">{formatMoney(h.amountMinor, currency)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={h.nature === 'DIRECT' ? 'h-full bg-[var(--brand-500)]' : 'h-full bg-warning'}
                        style={{ width: `${topMax > 0 ? Math.max(4, (h.amountMinor / topMax) * 100) : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search title, vendor, bill number or notes">
          <ExpenseFilters heads={heads} />
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'No expenses match' : 'No expenses yet'}
            description={
              canManage
                ? 'Record school spends like salaries, electricity, rent, stationery, repairs and event costs.'
                : 'Expenses recorded by accounts or front office will appear here.'
            }
            action={canManage ? <NewExpenseButton heads={heads} /> : undefined}
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Expense</TH>
                    <TH>Head</TH>
                    <TH>Type</TH>
                    <TH>Paid by</TH>
                    <TH align="right">Amount</TH>
                    {canManage ? <TH align="right"> </TH> : null}
                  </tr>
                </THead>
                <TBody>
                  {rows.map((row) => {
                    const receiptUrl = row.receiptKey ? `/api/v1/files/${encodeURIComponent(row.receiptKey)}` : null
                    return (
                      <TR key={row.id}>
                        <TD className="text-sm text-ink-muted whitespace-nowrap">{formatDay(row.expenseDate)}</TD>
                        <TD>
                          <p className="flex items-center gap-1.5 text-sm text-ink">
                            {row.title}
                            {receiptUrl ? (
                              <a href={receiptUrl} title={row.receiptName ?? 'Receipt'} className="text-[var(--brand-600)]">
                                <Paperclip className="size-3.5" aria-label="Receipt attached" />
                              </a>
                            ) : null}
                          </p>
                          <p className="text-xs text-ink-subtle">
                            {[row.vendor, row.referenceNo, row.recordedByLabel].filter(Boolean).join(' · ')}
                          </p>
                        </TD>
                        <TD className="text-sm text-ink-muted">{row.headName}</TD>
                        <TD>
                          <Badge tone={row.nature === 'DIRECT' ? 'brand' : 'warning'}>{natureLabel(row.nature)}</Badge>
                        </TD>
                        <TD className="text-sm text-ink-muted">{paymentModeLabel(row.paymentMode)}</TD>
                        <TD align="right" className="text-sm font-medium text-ink tnum">
                          {formatMoney(row.amountMinor, currency)}
                        </TD>
                        {canManage ? (
                          <TD align="right">
                            <EditExpenseButton
                              heads={heads}
                              expense={{
                                id: row.id,
                                title: row.title,
                                headId: row.headId,
                                amountMinor: row.amountMinor,
                                expenseDateInput: row.expenseDateInput,
                                paymentMode: row.paymentMode,
                                vendor: row.vendor,
                                referenceNo: row.referenceNo,
                                notes: row.notes,
                                receiptName: row.receiptName,
                                receiptUrl,
                              }}
                            />
                          </TD>
                        ) : null}
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="expenses" />
          </>
        )}
      </Card>
    </div>
  )
}
