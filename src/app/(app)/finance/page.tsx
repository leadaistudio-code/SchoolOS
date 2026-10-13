import Link from 'next/link'
import { AlertCircle, BadgeIndianRupee, TrendingUp, Wallet } from 'lucide-react'
import { addDays, startOfMonth } from 'date-fns'
import { requireContext } from '@/server/context'
import { outstandingByClass } from '@/server/modules/finance/service'
import { attendanceDate, formatDay } from '@/lib/dates'
import { isSelfScoped, isTeacherScoped } from '@/lib/rbac/roles'
import { studentIdScopeWhere } from '@/server/scope'
import {
  ColorBanner,
  ColorTile,
  colorBannerPrimaryBtn,
  colorBannerSecondaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney, formatNumber, cn } from '@/lib/utils'
import { ParentFinance } from './parent-finance'
import { buttonVariants } from '@/components/ui/button-variants'
import { channelBreakdown, collectionTrend, incomeVsExpense, topDefaulters } from '@/server/modules/finance/dashboard'
import { CollectionTrendChart } from './collection-trend-chart'
import { ExpenseChart } from './expenses/expense-chart'
import { LateFinesButton } from './late-fines-button'

export const metadata = { title: 'Finance' }

export default async function FinancePage() {
  const ctx = await requireContext('fees.view')

  // Parents and students get a "what do I owe and how do I pay it" page, not
  // the school's collection dashboard.
  if (isSelfScoped(ctx.user.roleKeys)) return <ParentFinance />

  const invoiceScope = await studentIdScopeWhere(ctx)
  const scopedFinance = isTeacherScoped(ctx.user.roleKeys)

  const today = attendanceDate(new Date())
  const monthStart = startOfMonth(new Date())

  const invoiceWhere = { ...invoiceScope, status: { not: 'CANCELLED' as const } }
  const openInvoiceWhere = { ...invoiceScope, status: { not: 'CANCELLED' as const }, balanceMinor: { gt: 0 } }

  const [billed, collectedToday, collectedMonth, outstanding, overdue, byClass, recent] =
    await Promise.all([
      ctx.db.feeInvoice.aggregate({
        where: invoiceWhere,
        _sum: { totalMinor: true },
        _count: { _all: true },
      }),
      ctx.db.feePayment.aggregate({
        where: {
          status: 'SUCCESS',
          paidAt: { gte: today },
          ...(invoiceScope.studentId ? { studentId: invoiceScope.studentId } : {}),
        },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      ctx.db.feePayment.aggregate({
        where: {
          status: 'SUCCESS',
          paidAt: { gte: monthStart },
          ...(invoiceScope.studentId ? { studentId: invoiceScope.studentId } : {}),
        },
        _sum: { amountMinor: true },
      }),
      ctx.db.feeInvoice.aggregate({
        where: openInvoiceWhere,
        _sum: { balanceMinor: true },
      }),
      ctx.db.feeInvoice.aggregate({
        where: { ...openInvoiceWhere, dueOn: { lt: today } },
        _sum: { balanceMinor: true },
        _count: { _all: true },
      }),
      outstandingByClass(ctx),
      ctx.db.feePayment.findMany({
        where: {
          status: 'SUCCESS',
          ...(invoiceScope.studentId ? { studentId: invoiceScope.studentId } : {}),
        },
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
  const [studentBalances, dueSoon, reconciliation, pendingCheques, pendingRefunds] =
    await Promise.all([
      ctx.db.feeInvoice.groupBy({
        by: ['studentId'],
        where: invoiceWhere,
        _sum: { totalMinor: true, paidMinor: true, balanceMinor: true },
      }),
      ctx.db.feeInvoice.aggregate({
        where: {
          ...openInvoiceWhere,
          dueOn: { gte: today, lte: addDays(today, 7) },
        },
        _sum: { balanceMinor: true },
      }),
      ctx.db.feePayment.count({
        where: {
          status: { in: ['INITIATED', 'PENDING'] },
          ...(invoiceScope.studentId ? { studentId: invoiceScope.studentId } : {}),
        },
      }),
      ctx.db.feePayment.count({
        where: {
          mode: 'CHEQUE',
          status: 'PENDING',
          ...(invoiceScope.studentId ? { studentId: invoiceScope.studentId } : {}),
        },
      }),
      ctx.db.feeRefund.count({ where: { status: 'PENDING' } }),
    ])
  const paymentStatus = studentBalances.reduce(
    (counts, row) => {
      const total = row._sum.totalMinor ?? 0
      const paid = row._sum.paidMinor ?? 0
      const balance = row._sum.balanceMinor ?? 0
      if (balance <= 0) counts.paid++
      else if (paid > 0) counts.partial++
      else counts.due++
      return counts
    },
    { paid: 0, partial: 0, due: 0 },
  )
  const overdueStudents = await ctx.db.feeInvoice.groupBy({
    by: ['studentId'],
    where: { ...openInvoiceWhere, dueOn: { lt: today } },
  })
  // School-wide analytics; teachers with a scoped view do not see these.
  const [trend, channels, defaulters, pnl] = scopedFinance
    ? [null, null, null, null]
    : await Promise.all([
        collectionTrend(ctx),
        channelBreakdown(ctx),
        ctx.can('fees.accounts') ? topDefaulters(ctx) : Promise.resolve(null),
        ctx.can('expenses.view') ? incomeVsExpense(ctx) : Promise.resolve(null),
      ])
  const channelTotal = channels ? channels.officeMinor + channels.onlineMinor : 0

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="fees"
        eyebrow="Finance"
        title={`${collectionRate}% collected`}
        description={
          scopedFinance
            ? `${formatMoney(outstandingMinor, currency)} outstanding across your students · read-only view`
            : `${formatNumber(billed._count._all)} invoices this session · ${formatMoney(outstandingMinor, currency)} still outstanding`
        }
        actions={
          <>
            {ctx.can('fees.invoice') ? (
              <Link href="/finance/invoices" className={colorBannerSecondaryBtn()}>
                Invoices
              </Link>
            ) : null}
            {ctx.can('fees.collect') ? (
              <Link href="/finance/collect" className={colorBannerPrimaryBtn()}>
                Collect a payment
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <ColorTile
          label="Collected today"
          value={formatMoney(collectedToday._sum.amountMinor ?? 0, currency)}
          sub={`${formatNumber(collectedToday._count._all)} payments`}
          tone="fees"
          href="/finance/payments"
          icon={<BadgeIndianRupee className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Collected this month"
          value={formatMoney(collectedMonth._sum.amountMinor ?? 0, currency)}
          sub={`of ${formatMoney(billedMinor, currency)} billed`}
          tone="attendance"
          href="/finance/payments"
          icon={<TrendingUp className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Outstanding"
          value={formatMoney(outstandingMinor, currency)}
          sub={`${collectionRate}% of billing collected`}
          tone="pending"
          href="/finance/outstanding"
          icon={<Wallet className="size-5" aria-hidden />}
          delayMs={120}
        />
        <ColorTile
          label="Overdue"
          value={formatMoney(overdue._sum.balanceMinor ?? 0, currency)}
          sub={`${formatNumber(overdue._count._all)} invoices past due`}
          tone="overdue"
          href="/finance/outstanding"
          icon={<AlertCircle className="size-5" aria-hidden />}
          delayMs={160}
        />
        <ColorTile
          label="Collection rate"
          value={`${collectionRate}%`}
          sub={`${formatMoney(billedMinor - outstandingMinor, currency)} collected`}
          tone="fees"
          href="/finance/reports"
          icon={<TrendingUp className="size-5" aria-hidden />}
          delayMs={200}
        />
      </div>

      {!scopedFinance ? (
        <div className="flex flex-wrap items-center gap-2">
          {ctx.can('fees.report') ? (
            <Link href="/finance/day-end" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Day-end sheet
            </Link>
          ) : null}
          {ctx.can('fees.structure') ? <LateFinesButton /> : null}
          {ctx.can('fees.invoice') ? (
            <Link href="/finance/invoices" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Generate installments
            </Link>
          ) : null}
          <Link href="/finance/payments?preset=today" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Today&apos;s receipts
          </Link>
          {ctx.can('accounts.view') ? (
            <Link href="/accounts" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Accounts &amp; ledger
            </Link>
          ) : null}
        </div>
      ) : null}

      {trend && channels ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Collection trend (6 months)</CardTitle>
              <Link href="/finance/reports" className="text-xs text-[var(--brand-600)] hover:underline">Reports</Link>
            </CardHeader>
            <CardContent>
              <CollectionTrendChart data={trend} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>This month by channel</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {channelTotal === 0 ? (
                <p className="text-sm text-ink-muted">No collections yet this month.</p>
              ) : (
                <>
                  <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="bg-[var(--brand-500)]" style={{ width: `${(channels.officeMinor / channelTotal) * 100}%` }} />
                    <div className="bg-success" style={{ width: `${(channels.onlineMinor / channelTotal) * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-ink-muted">
                    <span>Office {formatMoney(channels.officeMinor, currency)}</span>
                    <Link href="/finance/online" className="hover:underline">Online {formatMoney(channels.onlineMinor, currency)}</Link>
                  </div>
                  <ul className="divide-y divide-[var(--border)]">
                    {channels.modes.map((m) => (
                      <li key={m.mode} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="first-letter:uppercase">{m.mode.toLowerCase().replaceAll('_', ' ')} <span className="text-xs text-ink-subtle">· {m.count}</span></span>
                        <span className="tnum">{formatMoney(m.amountMinor, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {pnl ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Income vs expenses (this financial year)</CardTitle>
              <Link href="/finance/expenses" className="text-xs text-[var(--brand-600)] hover:underline">Expenses</Link>
            </CardHeader>
            <CardContent>
              <ExpenseChart data={pnl.months} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Surplus snapshot</CardTitle>
              {ctx.can('accounts.view') ? (
                <Link href="/accounts/profit-loss" className="text-xs text-[var(--brand-600)] hover:underline">Profit &amp; Loss</Link>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {([['This month', pnl.month], ['Financial year to date', pnl.fy]] as const).map(([label, v]) => (
                <div key={label}>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    <li className="flex justify-between"><span>Fees collected</span><span className="tnum">{formatMoney(v.incomeMinor, currency)}</span></li>
                    <li className="flex justify-between"><span>Less direct expenses</span><span className="tnum">{formatMoney(v.directMinor, currency)}</span></li>
                    <li className="flex justify-between"><span>Less indirect expenses</span><span className="tnum">{formatMoney(v.indirectMinor, currency)}</span></li>
                    <li className="flex justify-between border-t border-[var(--border)] pt-1 font-semibold">
                      <span>{v.netMinor >= 0 ? 'Net surplus' : 'Net deficit'}</span>
                      <span className={cn('tnum', v.netMinor >= 0 ? 'text-success' : 'text-[var(--danger)]')}>{formatMoney(v.netMinor, currency)}</span>
                    </li>
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {defaulters && defaulters.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Top defaulters</CardTitle>
            <Link href="/finance/dues/monthly?filter=defaulters" className="text-xs text-[var(--brand-600)] hover:underline">Month-wise dues</Link>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Student</TH>
                    <TH>Class</TH>
                    <TH>Overdue since</TH>
                    <TH align="right">Invoices</TH>
                    <TH align="right">Overdue</TH>
                  </tr>
                </THead>
                <TBody>
                  {defaulters.map((d) => (
                    <TR key={d.studentId}>
                      <TD>
                        <Link href={`/finance/students/${d.studentId}`} className="text-sm font-medium text-ink hover:text-[var(--brand-600)]">{d.name}</Link>
                        <span className="block text-xs text-ink-subtle">{d.admissionNo}</span>
                      </TD>
                      <TD className="text-sm text-ink-muted">{d.className}</TD>
                      <TD className="text-sm text-ink-muted">{d.oldestDue ? formatDay(d.oldestDue) : ''}</TD>
                      <TD align="right" className="text-sm">{d.invoices}</TD>
                      <TD align="right" className="text-sm font-medium text-[var(--danger)]">{formatMoney(d.overdueMinor, currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Student payment status</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div><p className="text-xs text-ink-muted">Paid</p><p className="text-xl font-semibold tnum text-success">{paymentStatus.paid}</p></div>
            <div><p className="text-xs text-ink-muted">Partially paid</p><p className="text-xl font-semibold tnum text-warning">{paymentStatus.partial}</p></div>
            <div><p className="text-xs text-ink-muted">Due</p><p className="text-xl font-semibold tnum text-ink">{paymentStatus.due}</p></div>
            <div><p className="text-xs text-ink-muted">Overdue</p><p className="text-xl font-semibold tnum text-[var(--danger)]">{overdueStudents.length}</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Needs attention</CardTitle></CardHeader>
          <CardContent className="py-1">
            <ul className="divide-y divide-[var(--border)]">
              <li className="flex items-center justify-between gap-3 py-2"><span className="text-sm text-ink">{overdueStudents.length} students have overdue fees</span><Link href="/finance/dues" className="text-xs text-[var(--brand-600)] hover:underline">View dues</Link></li>
              <li className="flex items-center justify-between gap-3 py-2"><span className="text-sm text-ink">{formatMoney(dueSoon._sum.balanceMinor ?? 0, currency)} due within 7 days</span><Link href="/finance/dues" className="text-xs text-[var(--brand-600)] hover:underline">Review</Link></li>
              <li className="flex items-center justify-between gap-3 py-2"><span className="text-sm text-ink">{reconciliation} payments require reconciliation</span><Link href="/finance/payments?status=PENDING" className="text-xs text-[var(--brand-600)] hover:underline">Open payments</Link></li>
              <li className="flex items-center justify-between gap-3 py-2"><span className="text-sm text-ink">{pendingCheques} cheques pending clearance</span><Link href="/finance/payments?view=pending_cheque" className="text-xs text-[var(--brand-600)] hover:underline">Clear / bounce</Link></li>
              <li className="flex items-center justify-between gap-3 py-2"><span className="text-sm text-ink">{pendingRefunds} refunds await approval</span><Link href="/finance/payments" className="text-xs text-[var(--brand-600)] hover:underline">Review</Link></li>
            </ul>
          </CardContent>
        </Card>

        <Card variant="elevated" className="overflow-hidden">
          <CardHeader>
            <CardTitle>Outstanding by class</CardTitle>
            <Link
              href="/finance/outstanding"
              className="text-xs text-[var(--brand-600)] hover:underline"
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
                        <TD className="text-sm text-ink font-medium">{r.className}</TD>
                        <TD align="right" className="text-sm text-ink-muted">
                          {Number(r.students)}
                        </TD>
                        <TD align="right" className="text-sm">
                          {formatMoney(Number(r.outstanding), currency)}
                        </TD>
                        <TD align="right">
                          <span
                            className={cn(
                              'text-sm',
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

        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Recent receipts</CardTitle>
            <Link
              href="/finance/payments"
              className="text-xs text-[var(--brand-600)] hover:underline"
            >
              All payments
            </Link>
          </CardHeader>
          <CardContent className="py-1">
            {recent.length === 0 ? (
              <EmptyState
                title="No payments yet"
                description="Collected fees will appear here with their receipt numbers."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/finance/payments/${p.id}`}
                        className="text-sm text-ink hover:text-[var(--brand-600)] truncate block"
                      >
                        {p.student.firstName} {p.student.lastName}
                      </Link>
                      <p className="text-xs text-ink-subtle">
                        {p.receipt?.number ?? 'no receipt'} · {p.mode.toLowerCase().replace('_', ' ')}
                        {p.paidAt ? ` · ${formatDay(p.paidAt, 'd MMM')}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-medium tnum text-ink shrink-0">
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
