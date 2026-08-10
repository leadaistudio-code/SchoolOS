import Link from 'next/link'
import { requireContext } from '@/server/context'
import { scopedStudents } from '@/server/scope'
import { formatDay } from '@/lib/dates'
import { attendanceDate } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Metric } from '@/components/ui/metric'
import { formatMoney } from '@/lib/utils'
import { PayNow } from './pay-now'

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID: 'success',
  ISSUED: 'warning',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
}

/**
 * The parent and student view of fees: what is owed, by when, and a way to pay
 * it. Deliberately not the school's collection dashboard — a parent wants an
 * answer, not a report.
 */
export async function ParentFinance() {
  const ctx = await requireContext('fees.view')
  const children = await scopedStudents(ctx)
  const currency = ctx.tenant.currency
  const today = attendanceDate(new Date())

  if (children.length === 0) {
    return (
      <EmptyState
        title="No student linked to this account"
        description="Please contact the school office."
      />
    )
  }

  const invoices = await ctx.db.feeInvoice.findMany({
    where: {
      studentId: { in: children.map((c) => c.id) },
      status: { not: 'CANCELLED' },
    },
    orderBy: [{ balanceMinor: 'desc' }, { dueOn: 'asc' }],
    include: {
      lines: { select: { label: true, amountMinor: true, discountMinor: true } },
      student: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  const receipts = await ctx.db.feePayment.findMany({
    where: { studentId: { in: children.map((c) => c.id) }, status: 'SUCCESS' },
    orderBy: { paidAt: 'desc' },
    take: 10,
    select: {
      id: true,
      amountMinor: true,
      mode: true,
      paidAt: true,
      receipt: { select: { number: true } },
      student: { select: { firstName: true } },
    },
  })

  const totalDue = invoices.reduce((sum, i) => sum + i.balanceMinor, 0)
  const overdue = invoices.filter((i) => i.balanceMinor > 0 && i.dueOn < today)
  const nextDue = invoices.find((i) => i.balanceMinor > 0)

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader
        title="Fees"
        description={
          totalDue > 0
            ? `${formatMoney(totalDue, currency)} outstanding`
            : 'Nothing outstanding'
        }
      />

      {totalDue > 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <Metric
              className="px-0 py-0"
              label="Total outstanding"
              value={formatMoney(totalDue, currency)}
              emphasis={overdue.length > 0 ? 'danger' : undefined}
              sub={
                overdue.length > 0
                  ? `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} past due`
                  : nextDue
                    ? `Next due ${formatDay(nextDue.dueOn, 'd MMMM yyyy')}`
                    : undefined
              }
            />

            <PayNow
              students={children.map((c) => ({
                id: c.id,
                name: `${c.firstName} ${c.lastName}`,
                dueMinor: invoices
                  .filter((i) => i.studentId === c.id)
                  .reduce((sum, i) => sum + i.balanceMinor, 0),
              }))}
              currency={currency}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="py-1">
          {invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Fee invoices issued by the school will appear here."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {invoices.map((i) => (
                <li key={i.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/finance/invoices/${i.id}`}
                        className="text-base font-medium text-ink hover:text-[var(--brand-600)]"
                      >
                        {i.title}
                      </Link>
                      <p className="text-xs text-ink-subtle">
                        {i.number}
                        {children.length > 1 ? ` · ${i.student.firstName}` : ''} · due{' '}
                        {formatDay(i.dueOn, 'd MMM yyyy')}
                      </p>
                      <p className="text-xs text-ink-muted mt-1">
                        {i.lines
                          .slice(0, 3)
                          .map((l) => l.label)
                          .join(', ')}
                        {i.lines.length > 3 ? ` +${i.lines.length - 3} more` : ''}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-base font-medium tnum text-ink">
                        {formatMoney(i.balanceMinor, currency)}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        of {formatMoney(i.totalMinor, currency)}
                      </p>
                      <Badge tone={STATUS_TONE[i.status] ?? 'neutral'} className="mt-1">
                        {i.status.toLowerCase().replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="py-1">
          {receipts.length === 0 ? (
            <EmptyState title="No payments yet" description="Your receipts will be listed here." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {receipts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/finance/payments/${p.id}`}
                      className="text-sm text-ink hover:text-[var(--brand-600)]"
                    >
                      {p.receipt?.number ?? 'Receipt pending'}
                    </Link>
                    <p className="text-xs text-ink-subtle">
                      {p.paidAt ? formatDay(p.paidAt, 'd MMM yyyy') : ''} ·{' '}
                      {p.mode.toLowerCase().replace('_', ' ')}
                      {children.length > 1 ? ` · ${p.student.firstName}` : ''}
                    </p>
                  </div>
                  <span className="text-base font-medium tnum text-success shrink-0">
                    {formatMoney(p.amountMinor, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
