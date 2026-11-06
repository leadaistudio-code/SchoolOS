import Link from 'next/link'
import { requireGroupOwner } from '@/server/modules/group/access'
import { groupFigures, groupTrend } from '@/server/modules/group/figures'
import { formatMoney, formatNumber } from '@/lib/utils'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { BalancesCard, ExpenseCategoriesCard, HeadlineTiles, MoneyCard, PeriodTabs, resolvePeriod, TrendCard } from './parts'

export const metadata = { title: 'Group overview' }

export default async function GroupOverviewPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const [{ scope }, { period: raw }] = await Promise.all([requireGroupOwner(), searchParams])
  const period = resolvePeriod(raw)
  const [{ rows, total, expenseByCategory }, trend] = await Promise.all([
    groupFigures(scope.schools, period.range),
    groupTrend(scope.schools.map((s) => s.tenantId)),
  ])

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="admissions"
        eyebrow="Group overview"
        title={scope.groupName}
        description={`Combined figures for ${scope.schools.length} school${scope.schools.length === 1 ? '' : 's'}: ${scope.schools.map((s) => s.name).join(', ')}. Visible only to the group owner.`}
      />

      <PeriodTabs base="/group" active={period.key} />

      <HeadlineTiles total={total} periodLabel={period.label} schools={scope.schools.length} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <MoneyCard total={total} periodLabel={period.label} />
        <BalancesCard total={total} />
      </div>

      <Card variant="elevated" className="overflow-hidden">
        <CardHeader>
          <CardTitle>School by school · {period.label}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>School</TH>
                  <TH align="right">Students</TH>
                  <TH align="right">Staff</TH>
                  <TH align="right">Income</TH>
                  <TH align="right">Costs</TH>
                  <TH align="right">Profit</TH>
                  <TH align="right">Outstanding</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.tenantId}>
                    <TD>
                      <Link href={`/group/schools/${r.tenantId}?period=${period.key}`} className="font-medium text-[var(--brand-600)] hover:underline">
                        {r.name}
                      </Link>
                    </TD>
                    <TD align="right" className="tnum">{formatNumber(r.students)}</TD>
                    <TD align="right" className="tnum">{formatNumber(r.staff)}</TD>
                    <TD align="right" className="tnum">{formatMoney(r.incomeMinor)}</TD>
                    <TD align="right" className="tnum">{formatMoney(r.costMinor)}</TD>
                    <TD align="right" className={`tnum font-medium ${r.profitMinor < 0 ? 'text-[var(--danger-600,#dc2626)]' : ''}`}>
                      {formatMoney(r.profitMinor)}
                    </TD>
                    <TD align="right" className="tnum">{formatMoney(r.outstandingMinor)}</TD>
                  </TR>
                ))}
                <TR className="bg-surface-2 font-semibold">
                  <TD>All schools</TD>
                  <TD align="right" className="tnum">{formatNumber(total.students)}</TD>
                  <TD align="right" className="tnum">{formatNumber(total.staff)}</TD>
                  <TD align="right" className="tnum">{formatMoney(total.incomeMinor)}</TD>
                  <TD align="right" className="tnum">{formatMoney(total.costMinor)}</TD>
                  <TD align="right" className="tnum">{formatMoney(total.profitMinor)}</TD>
                  <TD align="right" className="tnum">{formatMoney(total.outstandingMinor)}</TD>
                </TR>
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TrendCard months={trend} />
        <ExpenseCategoriesCard rows={expenseByCategory} periodLabel={period.label} />
      </div>

      <p className="text-xs text-ink-subtle">
        Cash basis: income is fees received less refunds, plus store sales; costs are recorded expenses plus salaries paid through
        payroll. Student and staff numbers, balances and attendance are as of today.
      </p>
    </div>
  )
}
