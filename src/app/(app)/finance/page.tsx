import Link from 'next/link'
import { AlertCircle, BadgeIndianRupee, TrendingUp, Wallet } from 'lucide-react'
import { startOfMonth } from 'date-fns'
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
