import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getInvoice } from '@/server/modules/finance/service'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'

export const metadata = { title: 'Invoice' }

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID: 'success',
  ISSUED: 'warning',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireContext('fees.view')
  const invoice = await getInvoice(ctx, id)

  const currency = ctx.tenant.currency
  const enrollment = invoice.student.enrollments[0]
  const guardian = invoice.student.guardians[0]?.parent

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={invoice.title}
        description={`${invoice.number} · issued ${formatDay(invoice.issuedOn, 'd MMM yyyy')} · due ${formatDay(invoice.dueOn, 'd MMM yyyy')}`}
        actions={
          ctx.can('fees.collect') && invoice.balanceMinor > 0 ? (
            <Link
              href={`/finance/collect?student=${invoice.studentId}`}
              className={buttonVariants({ size: 'sm' })}
            >
              Collect payment
            </Link>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              {invoice.student.firstName} {invoice.student.lastName}
            </CardTitle>
            <p className="text-sm text-ink-muted mt-0.5">
              {invoice.student.admissionNo}
              {enrollment ? ` · ${enrollment.classLevel.name} ${enrollment.section.name}` : ''}
              {guardian ? ` · ${guardian.firstName} ${guardian.lastName}` : ''}
            </p>
          </div>
          <Badge tone={TONE[invoice.status] ?? 'neutral'}>
            {invoice.status.toLowerCase().replace('_', ' ')}
          </Badge>
        </CardHeader>

        <CardContent className="py-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-2 text-xs uppercase tracking-wide text-ink-subtle font-semibold">
                  Fee head
                </th>
                <th className="text-right py-2 text-xs uppercase tracking-wide text-ink-subtle font-semibold">
                  Amount
                </th>
                <th className="text-right py-2 text-xs uppercase tracking-wide text-ink-subtle font-semibold">
                  Concession
                </th>
                <th className="text-right py-2 text-xs uppercase tracking-wide text-ink-subtle font-semibold">
                  Payable
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {invoice.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 text-base text-ink">{l.label}</td>
                  <td className="py-2.5 text-right text-sm tnum text-ink-muted">
                    {formatMoney(l.amountMinor, currency)}
                  </td>
                  <td className="py-2.5 text-right text-sm tnum text-success">
                    {l.discountMinor > 0 ? `−${formatMoney(l.discountMinor, currency)}` : '—'}
                  </td>
                  <td className="py-2.5 text-right text-base tnum text-ink">
                    {formatMoney(l.amountMinor - l.discountMinor, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-line">
              <tr>
                <td className="py-2 text-base text-ink-muted" colSpan={3}>
                  Total
                </td>
                <td className="py-2 text-right text-lg font-semibold tnum text-ink">
                  {formatMoney(invoice.totalMinor, currency)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-sm text-ink-muted" colSpan={3}>
                  Paid
                </td>
                <td className="py-1 text-right text-base tnum text-success">
                  {formatMoney(invoice.paidMinor, currency)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-base font-medium text-ink" colSpan={3}>
                  Balance
                </td>
                <td className="py-1 text-right text-lg font-semibold tnum text-ink">
                  {formatMoney(invoice.balanceMinor, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {invoice.allocations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Payments against this invoice</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            <ul className="divide-y divide-[var(--border)]">
              {invoice.allocations.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <Link
                      href={`/finance/payments/${a.payment.id}`}
                      className="text-sm text-ink hover:text-[var(--brand-600)]"
                    >
                      {a.payment.receipt?.number ?? 'Receipt pending'}
                    </Link>
                    <p className="text-xs text-ink-subtle">
                      {a.payment.paidAt ? formatDay(a.payment.paidAt, 'd MMM yyyy') : ''} ·{' '}
                      {a.payment.mode.toLowerCase().replace('_', ' ')}
                      {a.payment.reference ? ` · ${a.payment.reference}` : ''}
                    </p>
                  </div>
                  <span className="text-base font-medium tnum text-ink shrink-0">
                    {formatMoney(a.amountMinor, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
