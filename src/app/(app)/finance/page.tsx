import Link from 'next/link'
import { startOfMonth } from 'date-fns'
import { requireContext } from '@/server/context'
import { outstandingByClass } from '@/server/modules/finance/service'
import { attendanceDate, formatDay } from '@/lib/dates'
import { isSelfScoped } from '@/lib/rbac/roles'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { ParentFinance } from './parent-finance'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Finance' }

export default async function FinancePage() {
  const ctx = await requireContext('fees.view')

  // Parents and students get a "what do I owe and how do I pay it" page, not
  // the school's collection dashboard.
  if (isSelfScoped(ctx.user.roleKeys)) return <ParentFinance />

  const today = attendanceDate(new Date())
  const monthStart = startOfMonth(new Date())

  const [billed, collectedToday, collectedMonth, outstanding, overdue, byClass, recent] =
    await Promise.all([
      ctx.db.feeInvoice.aggregate({
        where: { status: { not: 'CANCELLED' } },
        _sum: { totalMinor: true },
        _count: { _all: true },
      }),
      ctx.db.feePayment.aggregate({
        where: { status: 'SUCCESS', paidAt: { gte: today } },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      ctx.db.feePayment.aggregate({
        where: { status: 'SUCCESS', paidAt: { gte: monthStart } },
        _sum: { amountMinor: true },
      }),
      ctx.db.feeInvoice.aggregate({
        where: { status: { not: 'CANCELLED' }, balanceMinor: { gt: 0 } },
        _sum: { balanceMinor: true },
      }),
      ctx.db.feeInvoice.aggregate({
        where: { status: { not: 'CANCELLED' }, balanceMinor: { gt: 0 }, dueOn: { lt: today } },
        _sum: { balanceMinor: true },
        _count: { _all: true },
      }),
      outstandingByClass(ctx),
      ctx.db.feePayment.findMany({
        where: { status: 'SUCCESS' },
        orderBy: { paidAt: 'desc' },
        take: 8,
        select: {
          id: true,
          amountMinor: true,
          mode: true,
          paidAt: true,
          receipt: { select: { number: true } },
          student: { select: { firstName: true, lastName: true, admissionNo: true } },
        },
      }),
    ])

  const currency = ctx.tenant.currency
  const billedMinor = billed._sum.totalMinor ?? 0
  const outstandingMinor = outstanding._sum.balanceMinor ?? 0
  const collectionRate =
    billedMinor > 0 ? Math.round(((billedMinor - outstandingMinor) / billedMinor) * 100) : 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finance"
        description={`${billed._count._all} invoices this session · ${collectionRate}% collected`}
        actions={
          <>
            {ctx.can('fees.invoice') ? (
              <Link
                href="/finance/invoices"
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Invoices
              </Link>
            ) : null}
            {ctx.can('fees.collect') ? (
              <Link href="/finance/collect" className={buttonVariants({ size: 'sm' })}>
                Collect a payment
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Collected today"
          value={formatMoney(collectedToday._sum.amountMinor ?? 0, currency)}
          sub={`${collectedToday._count._all} payments`}
          icon="BadgeIndianRupee"
          tone="success"
          href="/finance/payments"
        />
        <StatCard
          label="This month"
          value={formatMoney(collectedMonth._sum.amountMinor ?? 0, currency)}
          sub={`of ${formatMoney(billedMinor, currency)} billed`}
          icon="TrendingUp"
          tone="info"
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstandingMinor, currency)}
          sub={`${collectionRate}% of billing collected`}
          icon="Wallet"
          tone={outstandingMinor > 0 ? 'warning' : 'success'}
          href="/finance/outstanding"
        />
        <StatCard
          label="Overdue"
          value={formatMoney(overdue._sum.balanceMinor ?? 0, currency)}
          sub={`${overdue._count._all} invoices past due`}
          icon="AlertCircle"
          tone={(overdue._count._all ?? 0) > 0 ? 'danger' : 'success'}
          href="/finance/outstanding"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Outstanding by class</CardTitle>
              <p className="text-[13px] text-ink-muted mt-0.5">Where the collection effort goes</p>
            </div>
            <Link
              href="/finance/outstanding"
              className="text-[12.5px] text-[var(--brand-600)] hover:underline"
            >
              Details
            </Link>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {byClass.length === 0 ? (
              <EmptyState title="Nothing outstanding" description="Every invoice is settled." />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Class</TH>
                      <TH align="right">Students</TH>
                      <TH align="right">Outstanding</TH>
                      <TH align="right">Overdue</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {byClass.map((r) => (
                      <TR key={r.className}>
                        <TD className="text-[13.5px] text-ink">{r.className}</TD>
                        <TD align="right" className="text-[13px] text-ink-muted">
                          {Number(r.students)}
                        </TD>
                        <TD align="right" className="text-[13px]">
                          {formatMoney(Number(r.outstanding), currency)}
                        </TD>
                        <TD align="right">
                          <span
                            className={cn(
                              'text-[13px]',
                              Number(r.overdue) > 0
                                ? 'text-[var(--danger)] font-medium'
                                : 'text-ink-subtle',
                            )}
                          >
                            {Number(r.overdue) > 0
                              ? formatMoney(Number(r.overdue), currency)
                              : '—'}
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent receipts</CardTitle>
            <Link
              href="/finance/payments"
              className="text-[12.5px] text-[var(--brand-600)] hover:underline"
            >
              All payments
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {recent.length === 0 ? (
              <EmptyState
                title="No payments yet"
                description="Collected fees will appear here with their receipt numbers."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/finance/payments/${p.id}`}
                        className="text-[13.5px] text-ink hover:text-[var(--brand-600)] truncate block"
                      >
                        {p.student.firstName} {p.student.lastName}
                      </Link>
                      <p className="text-[12px] text-ink-subtle">
                        {p.receipt?.number ?? 'no receipt'} · {p.mode.toLowerCase().replace('_', ' ')}
                        {p.paidAt ? ` · ${formatDay(p.paidAt, 'd MMM')}` : ''}
                      </p>
                    </div>
                    <span className="text-[13.5px] font-medium tnum text-ink shrink-0">
                      {formatMoney(p.amountMinor, currency)}
                    </span>
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
