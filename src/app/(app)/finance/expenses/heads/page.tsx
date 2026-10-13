import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listExpenseHeads } from '@/server/modules/finance/expense-heads'
import { EXPENSE_NATURES, categoryLabel } from '@/lib/finance/expense-options'
import { attendanceDate } from '@/lib/dates'
import { financialYearRange, schoolToday } from '@/lib/periods'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { HeadDialog } from './head-dialog'

export const metadata = { title: 'Expense heads' }

export default async function ExpenseHeadsPage() {
  const ctx = await requireContext('expenses.view')
  const fy = financialYearRange(schoolToday())
  const heads = await listExpenseHeads(ctx, { from: attendanceDate(fy.from), to: attendanceDate(fy.to) })
  const canManage = ctx.can('expenses.manage')
  const canAccounts = ctx.can('accounts.view')
  const currency = ctx.tenant.currency
  const fyLabel = `${fy.from.slice(0, 4)}-${fy.to.slice(2, 4)}`

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expense heads"
        description="Direct heads reduce gross surplus; indirect heads are the school's running costs. Each head has its own ledger account."
        actions={
          <>
            <BackButton fallbackHref="/finance/expenses" />
            {canManage ? <HeadDialog /> : null}
          </>
        }
      />

      {EXPENSE_NATURES.map((n) => {
        const group = heads.filter((h) => h.nature === n.value)
        const total = group.reduce((t, h) => t + h.amountMinor, 0)
        return (
          <Card key={n.value} className="overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>{n.label}s</CardTitle>
                <p className="mt-0.5 text-xs text-ink-muted">{n.hint}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink-muted">
                  FY {fyLabel}: <span className="font-semibold text-ink tnum">{formatMoney(total, currency)}</span>
                </span>
                {canManage ? <HeadDialog defaultNature={n.value} /> : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Head</TH>
                      <TH>Report group</TH>
                      {canAccounts ? <TH>Ledger account</TH> : null}
                      <TH align="right">Entries (FY)</TH>
                      <TH align="right">Spent (FY)</TH>
                      {canManage ? <TH align="right"> </TH> : null}
                    </tr>
                  </THead>
                  <TBody>
                    {group.map((h) => (
                      <TR key={h.id}>
                        <TD>
                          <Link href={`/finance/expenses?headId=${h.id}`} className="text-sm font-medium text-ink hover:text-[var(--brand-600)]">
                            {h.name}
                          </Link>
                          {!h.isActive ? <Badge className="ml-2">off</Badge> : null}
                          {h.description ? <span className="block text-xs text-ink-subtle">{h.description}</span> : null}
                        </TD>
                        <TD className="text-sm text-ink-muted">{categoryLabel(h.category)}</TD>
                        {canAccounts ? (
                          <TD className="text-sm text-ink-muted">
                            {h.account ? (
                              <Link href={`/accounts/ledger?account=${h.account.id}`} className="hover:text-[var(--brand-600)]">
                                {h.account.code} · {h.account.name}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </TD>
                        ) : null}
                        <TD align="right" className="text-sm tnum">{h.entries}</TD>
                        <TD align="right" className="text-sm font-medium tnum">{formatMoney(h.amountMinor, currency)}</TD>
                        {canManage ? (
                          <TD align="right">
                            <HeadDialog
                              head={{
                                id: h.id,
                                name: h.name,
                                nature: h.nature,
                                category: h.category,
                                description: h.description,
                                isActive: h.isActive,
                                entries: h.entries,
                              }}
                            />
                          </TD>
                        ) : null}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
