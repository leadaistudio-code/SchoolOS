import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getReceipt } from '@/server/modules/finance/payments'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { sumMinor } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { DocumentLetterhead } from '@/components/print/document-letterhead'
import { PrintButton } from './print-button'
import { RefundDialog } from './refund-dialog'

export const metadata = { title: 'Receipt' }

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('fees.view')
  const payment = await getReceipt(ctx, id)

  const school = ctx.tenant.school
  const currency = ctx.tenant.currency
  const enrollment = payment.student.enrollments[0]
  const guardian = payment.student.guardians[0]?.parent
  const refunded = sumMinor(
    payment.refunds.filter((r) => r.status !== 'FAILED').map((r) => r.amountMinor),
  )

  return (
    <div className="max-w-3xl">
      <div className="no-print">
        <PageHeader
          title={payment.receipt?.number ?? 'Payment'}
          description={
            payment.status === 'SUCCESS'
              ? `Received ${payment.paidAt ? formatDay(payment.paidAt, 'd MMMM yyyy') : ''}`
              : `This payment is ${payment.status.toLowerCase().replace('_', ' ')}`
          }
          actions={
            <>
              <PrintButton />
              {ctx.can('fees.refund') && payment.status === 'SUCCESS' ? (
                <RefundDialog
                  paymentId={payment.id}
                  maxMinor={payment.amountMinor - refunded}
                  currency={currency}
                />
              ) : null}
              <Link
                href="/finance/payments"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Back
              </Link>
            </>
          }
        />
      </div>

      <DocumentLetterhead
        schoolName={school?.name ?? ctx.tenant.name}
        logoUrl={school?.logoUrl}
        letterheadHeaderUrl={school?.letterheadHeaderUrl}
        letterheadFooterUrl={school?.letterheadFooterUrl}
        footerText={
          school?.footerText
            ? `This is a computer-generated receipt and is valid without a signature. ${school.footerText}`
            : 'This is a computer-generated receipt and is valid without a signature.'
        }
        signatureUrl={school?.signatureUrl}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-line">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-subtle">Fee receipt</p>
            {school?.code ? (
              <p className="text-xs text-ink-subtle mt-0.5">School code {school.code}</p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-ink tnum">
              {payment.receipt?.number ?? '—'}
            </p>
            <p className="text-xs text-ink-subtle">
              {payment.paidAt ? formatDay(payment.paidAt, 'd MMM yyyy') : ''}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 py-4 border-b border-line">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-subtle mb-1">Student</p>
            <p className="text-sm text-ink">
              {payment.student.firstName} {payment.student.lastName}
            </p>
            <p className="text-xs text-ink-muted">
              {payment.student.admissionNo}
              {enrollment
                ? ` · ${enrollment.classLevel.name} ${enrollment.section.name}`
                : ''}
              {enrollment?.rollNumber ? ` · Roll ${enrollment.rollNumber}` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-subtle mb-1">
              Received from
            </p>
            <p className="text-sm text-ink">
              {guardian ? `${guardian.firstName} ${guardian.lastName}` : 'Parent / guardian'}
            </p>
            <p className="text-xs text-ink-muted">
              {payment.mode.toLowerCase().replace('_', ' ')}
              {payment.reference ? ` · ${payment.reference}` : ''}
            </p>
            {payment.billBookNo ? (
              <p className="text-xs text-ink-muted tnum">
                Bill book {payment.billBookNo}
              </p>
            ) : null}
          </div>
        </div>

        <table className="w-full text-sm my-4">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left py-2 text-xs uppercase tracking-wide text-ink-subtle font-semibold">
                Applied to
              </th>
              <th className="text-right py-2 text-xs uppercase tracking-wide text-ink-subtle font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {payment.allocations.length === 0 ? (
              <tr>
                <td className="py-2.5 text-sm text-ink-muted" colSpan={2}>
                  Held as an advance against future invoices
                </td>
              </tr>
            ) : (
              payment.allocations.map((a) => (
                <tr key={a.id}>
                  <td className="py-2.5">
                    <span className="block text-sm text-ink">{a.invoice.title}</span>
                    <span className="block text-xs text-ink-subtle tnum">
                      {a.invoice.number}
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-base tnum text-ink">
                    {formatMoney(a.amountMinor, currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line">
              <td className="py-3 text-base font-semibold text-ink">Total received</td>
              <td className="py-3 text-right text-lg font-semibold tnum text-ink">
                {formatMoney(payment.amountMinor, currency)}
              </td>
            </tr>
            {refunded > 0 ? (
              <tr>
                <td className="py-1 text-sm text-[var(--danger)]">Refunded</td>
                <td className="py-1 text-right text-sm tnum text-[var(--danger)]">
                  −{formatMoney(refunded, currency)}
                </td>
              </tr>
            ) : null}
          </tfoot>
        </table>

        {payment.status !== 'SUCCESS' ? (
          <Badge tone={payment.status === 'FAILED' ? 'danger' : 'warning'}>
            {payment.status.toLowerCase().replace('_', ' ')}
          </Badge>
        ) : null}

        {!school?.letterheadFooterUrl && !school?.signatureUrl ? (
          <div className="flex items-end justify-end gap-4 pt-8 mt-4">
            <div className="text-center">
              <div className="h-10" />
              <p className="text-xs text-ink-subtle border-t border-line pt-1 px-6">
                Authorised signatory
              </p>
            </div>
          </div>
        ) : null}
      </DocumentLetterhead>
    </div>
  )
}
