import { requireContext } from '@/server/context'
import {
  categoryLabel,
  expenseFilterSchema,
  listExpenses,
  paymentModeLabel,
} from '@/server/modules/finance/expenses'
import { parseListQuery } from '@/lib/query'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { EditExpenseButton, NewExpenseButton } from './expense-forms'
import { ExpenseFilters } from './filters'

export const metadata = { title: 'Expenses' }

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('expenses.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const filter = expenseFilterSchema.parse({
    q: params.q,
    category: params.category || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
  })

  const { rows, total, totalMinor, byCategory } = await listExpenses(ctx, query, filter)
  const canManage = ctx.can('expenses.manage')
  const currency = ctx.tenant.currency

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expense tracker"
        description={`${total} entries · ${formatMoney(totalMinor, currency)} total in this view`}
        actions={canManage ? <NewExpenseButton /> : null}
      />

      {byCategory.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {byCategory.slice(0, 4).map((c) => (
            <Card key={c.category}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-ink-muted">
                  {categoryLabel(c.category)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-ink tnum">
                  {formatMoney(c.amountMinor, currency)}
                </p>
                <p className="text-xs text-ink-subtle">{c.count} entries</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search title, vendor, bill number or notes">
          <ExpenseFilters />
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState
            title={Object.keys(params).length ? 'No expenses match' : 'No expenses yet'}
            description={
              canManage
                ? 'Record school spends like electricity, stationery, repairs and event costs.'
                : 'Expenses recorded by accounts or front office will appear here.'
            }
            action={canManage ? <NewExpenseButton /> : undefined}
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Expense</TH>
                    <TH>Category</TH>
                    <TH>Paid by</TH>
                    <TH align="right">Amount</TH>
                    {canManage ? <TH align="right"> </TH> : null}
                  </tr>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD className="text-sm text-ink-muted whitespace-nowrap">
                        {formatDay(row.expenseDate)}
                      </TD>
                      <TD>
                        <p className="text-sm text-ink">{row.title}</p>
                        <p className="text-xs text-ink-subtle">
                          {[row.vendor, row.referenceNo, row.recordedByLabel]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </TD>
                      <TD>
                        <Badge>{categoryLabel(row.category)}</Badge>
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {paymentModeLabel(row.paymentMode)}
                      </TD>
                      <TD align="right" className="text-sm font-medium text-ink tnum">
                        {formatMoney(row.amountMinor, currency)}
                      </TD>
                      {canManage ? (
                        <TD align="right">
                          <EditExpenseButton
                            expense={{
                              id: row.id,
                              title: row.title,
                              category: row.category,
                              amountMinor: row.amountMinor,
                              expenseDateInput: row.expenseDateInput,
                              paymentMode: row.paymentMode,
                              vendor: row.vendor,
                              referenceNo: row.referenceNo,
                              notes: row.notes,
                            }}
                          />
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination
              total={total}
              page={query.page}
              pageSize={query.pageSize}
              label="expenses"
            />
          </>
        )}
      </Card>
    </div>
  )
}
