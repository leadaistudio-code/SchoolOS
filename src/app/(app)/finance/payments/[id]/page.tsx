import Link from 'next/link'
import { CheckCircle2, Landmark, ReceiptText, ShieldCheck } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getReceipt } from '@/server/modules/finance/payments'
import { formatDay, toDateInput } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { sumMinor } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { DocumentLetterhead } from '@/components/print/document-letterhead'
import { PrintButton } from './print-button'
import { RefundDialog } from './refund-dialog'
import { CancelReceiptDialog } from '../cancel-receipt-dialog'
import { EditReceiptDialog } from '../edit-receipt-dialog'

export const metadata = { title: 'Receipt' }

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('fees.view')
  const [payment, schoolDetails] = await Promise.all([
    getReceipt(ctx, id),
    ctx.db.school.findFirst({
      select: {
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        phone: true,
        email: true,
        website: true,
      },
    }),
  ])

  const school = ctx.tenant.school
  const currency = ctx.tenant.currency
  const enrollment = payment.student.enrollments[0]
  const guardian = payment.student.guardians[0]?.parent
  const refunded = sumMinor(
    payment.refunds.filter((r) => r.status !== 'FAILED').map((r) => r.amountMinor),
  )
  const allocated = sumMinor(payment.allocations.map((allocation) => allocation.amountMinor))
  const heldAsAdvance = Math.max(0, payment.amountMinor - allocated)
  const schoolAddress = schoolDetails
    ? [
        schoolDetails.addressLine1,
        schoolDetails.addressLine2,
        [schoolDetails.city, schoolDetails.state, schoolDetails.postalCode].filter(Boolean).join(', '),
        schoolDetails.country,
      ].filter(Boolean).join('\n')
    : null
  const schoolContact = schoolDetails
    ? [schoolDetails.phone, schoolDetails.email, schoolDetails.website].filter(Boolean).join(' · ')
    : null
  const paymentMode = payment.mode.toLowerCase().replaceAll('_', ' ')
  const receiptNumber = payment.receipt?.number ?? '—'

  return (
    <div className="mx-auto max-w-[210mm]">
      <div className="no-print">
        <PageHeader
          title={receiptNumber}
          description={
            payment.status === 'SUCCESS'
              ? `Received ${payment.paidAt ? formatDay(payment.paidAt, 'd MMMM yyyy') : ''}`
              : `This payment is ${payment.status.toLowerCase().replace('_', ' ')}`
          }
          actions={
            <>
              <PrintButton />
              {ctx.can('fees.collect') &&
              payment.status === 'SUCCESS' &&
              payment.provider === 'manual' ? (
                <EditReceiptDialog
                  values={{
                    paymentId: payment.id,
                    mode: payment.mode,
                    paidOn: payment.paidAt ? toDateInput(payment.paidAt) : '',
                    reference: payment.reference,
                    billBookNo: payment.billBookNo,
                    notes: payment.notes,
                  }}
                />
              ) : null}
              {ctx.can('fees.refund') && payment.status === 'SUCCESS' ? (
                <RefundDialog
                  paymentId={payment.id}
                  maxMinor={payment.amountMinor - refunded}
                  currency={currency}
                />
              ) : null}
              {ctx.can('fees.reverse') &&
              payment.status === 'SUCCESS' &&
              payment.provider === 'manual' ? (
                <CancelReceiptDialog paymentId={payment.id} />
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
        schoolAddress={schoolAddress}
        logoUrl={school?.logoUrl}
        letterheadHeaderUrl={school?.letterheadHeaderUrl}
        letterheadFooterUrl={school?.letterheadFooterUrl}
        footerText={
          school?.footerText
            ? `This is a computer-generated receipt and is valid without a signature. ${school.footerText}`
            : 'This is a computer-generated receipt and is valid without a signature.'
        }
        signatureUrl={school?.signatureUrl}
        className="receipt-document overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-card)] print:rounded-none print:border-0 print:shadow-none"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-[var(--radius)] bg-[var(--product-500)] text-white print:border print:border-line print:bg-white print:text-ink">
              <ReceiptText className="size-6" aria-hidden />
            </div>
            <div>
              <p className="text-xl font-semibold text-ink">Fee payment receipt</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Official acknowledgement of payment
                {school?.code ? ` · School code ${school.code}` : ''}
              </p>
            </div>
          </div>
          <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
            payment.status === 'SUCCESS'
              ? 'bg-success-bg text-success'
              : payment.status === 'FAILED'
                ? 'bg-danger-bg text-[var(--danger)]'
                : 'bg-warning-bg text-warning'
          }`}>
            <CheckCircle2 className="size-4" aria-hidden />
            <span className="text-xs font-semibold">
              {payment.status === 'SUCCESS' ? 'Payment received' : payment.status.toLowerCase().replaceAll('_', ' ')}
            </span>
          </div>
        </div>

        <div className="mb-5 grid overflow-hidden rounded-[var(--radius)] border border-line sm:grid-cols-2">
          <div className="bg-[var(--product-50)] p-4">
            <p className="text-xs font-semibold text-ink-muted">Receipt number</p>
            <p className="mt-1 text-lg font-semibold text-ink tnum">{receiptNumber}</p>
            <p className="mt-3 text-xs font-semibold text-ink-muted">Payment date</p>
            <p className="mt-1 text-sm font-medium text-ink">
              {payment.paidAt ? formatDay(payment.paidAt, 'd MMMM yyyy') : '—'}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs font-semibold text-ink-muted">Amount received</p>
            <p className="mt-1 text-2xl font-semibold text-ink tnum">
              {formatMoney(payment.amountMinor, currency)}
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
              <Landmark className="size-3.5" aria-hidden />
              <span className="capitalize">{paymentMode}</span>
              {payment.reference ? <span className="tnum">· Ref. {payment.reference}</span> : null}
            </p>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <section className="rounded-[var(--radius)] bg-surface-2 p-4">
            <p className="text-xs font-semibold text-ink-muted">Student details</p>
            <p className="mt-1.5 text-base font-semibold text-ink">
              {payment.student.firstName} {payment.student.lastName}
            </p>
            <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-ink-subtle">Admission no.</dt>
              <dd className="font-medium text-ink tnum">{payment.student.admissionNo}</dd>
              <dt className="text-ink-subtle">Class</dt>
              <dd className="font-medium text-ink">
                {enrollment
                  ? `${enrollment.classLevel.name} ${enrollment.section.name}`
                  : '—'}
              </dd>
              <dt className="text-ink-subtle">Roll number</dt>
              <dd className="font-medium text-ink tnum">{enrollment?.rollNumber ?? '—'}</dd>
            </dl>
          </section>
          <section className="rounded-[var(--radius)] bg-surface-2 p-4">
            <p className="text-xs font-semibold text-ink-muted">Payment details</p>
            <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-ink-subtle">Received from</dt>
              <dd className="font-medium text-ink">
              {guardian ? `${guardian.firstName} ${guardian.lastName}` : 'Parent / guardian'}
              </dd>
              <dt className="text-ink-subtle">Collected by</dt>
              <dd className="font-medium text-ink">
                {payment.collectedBy
                  ? `${payment.collectedBy.firstName} ${payment.collectedBy.lastName}`
                  : '—'}
              </dd>
              <dt className="text-ink-subtle">Payment mode</dt>
              <dd className="font-medium capitalize text-ink">{paymentMode}</dd>
              <dt className="text-ink-subtle">Reference</dt>
              <dd className="font-medium text-ink tnum">{payment.reference ?? '—'}</dd>
              <dt className="text-ink-subtle">Bill book no.</dt>
              <dd className="font-medium text-ink tnum">{payment.billBookNo ?? '—'}</dd>
            </dl>
          </section>
        </div>

        <div className="mb-5 overflow-hidden rounded-[var(--radius)] border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--product-50)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-muted">
                  Fee description
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-muted">
                  Invoice
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-ink-muted">
                  Applied amount
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-ink-muted">
                  Balance now
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {payment.allocations.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <span className="block text-sm font-medium text-ink">{a.invoice.title}</span>
                    {a.invoice.lines.length > 0 ? (
                      <span className="mt-0.5 block max-w-md text-xs text-ink-subtle">
                        {[...new Set(a.invoice.lines.map((line) => line.label))].join(', ')}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted tnum">
                    {a.invoice.number}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium tnum text-ink">
                    {formatMoney(a.amountMinor, currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tnum text-ink">
                    {a.invoice.balanceMinor > 0
                      ? formatMoney(a.invoice.balanceMinor, currency)
                      : 'Nil'}
                  </td>
                </tr>
              ))}
              {heldAsAdvance > 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-ink">Advance credit</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">Future fees</td>
                  <td className="px-4 py-3 text-right text-sm font-medium tnum text-ink">
                    {formatMoney(heldAsAdvance, currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tnum text-ink-muted">—</td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-2">
                <td className="px-4 py-3 text-base font-semibold text-ink" colSpan={2}>
                  Total received
                </td>
                <td className="px-4 py-3 text-right text-lg font-semibold tnum text-ink">
                  {formatMoney(payment.amountMinor, currency)}
                </td>
                <td className="px-4 py-3" />
              </tr>
              {refunded > 0 ? (
                <tr>
                  <td className="px-4 py-2 text-sm text-[var(--danger)]" colSpan={2}>Refunded</td>
                  <td className="px-4 py-2 text-right text-sm tnum text-[var(--danger)]">
                    −{formatMoney(refunded, currency)}
                  </td>
                  <td className="px-4 py-2" />
                </tr>
              ) : null}
            </tfoot>
          </table>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius)] border border-line bg-surface-2 px-4 py-3">
            <p className="text-xs font-semibold text-ink-muted">Outstanding balance (updated)</p>
            <p className="mt-1 text-xl font-semibold tnum text-ink">
              {payment.outstandingMinor > 0
                ? formatMoney(payment.outstandingMinor, currency)
                : 'Nil'}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              Remaining dues on this student&apos;s fee account after this payment
            </p>
          </div>
          <div className="rounded-[var(--radius)] border border-line bg-surface-2 px-4 py-3">
            <p className="text-xs font-semibold text-ink-muted">Advance credit held</p>
            <p className="mt-1 text-xl font-semibold tnum text-ink">
              {payment.advanceMinor > 0
                ? formatMoney(payment.advanceMinor, currency)
                : 'Nil'}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              Unallocated amount available for future invoices
            </p>
          </div>
        </div>

        {payment.status !== 'SUCCESS' ? (
          <Badge tone={payment.status === 'FAILED' ? 'danger' : 'warning'}>
            {payment.status.toLowerCase().replace('_', ' ')}
          </Badge>
        ) : null}

        {payment.notes ? (
          <div className="mb-5 rounded-[var(--radius-sm)] bg-surface-2 px-4 py-3">
            <p className="text-xs font-semibold text-ink-muted">Payment note</p>
            <p className="mt-1 text-sm text-ink">{payment.notes}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-end justify-between gap-6 border-t border-line pt-5">
          <div className="max-w-md">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <ShieldCheck className="size-4" aria-hidden />
              Secure digital receipt
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              Receipt {receiptNumber} was generated from the school&apos;s fee ledger.
              {schoolContact ? ` ${schoolContact}` : ''}
            </p>
          </div>
          {!school?.letterheadFooterUrl && !school?.signatureUrl ? (
            <div className="min-w-40 text-center">
              <div className="h-10" />
              <p className="border-t border-line px-5 pt-1 text-xs text-ink-subtle">
                Authorised signatory
              </p>
            </div>
          ) : null}
        </div>
      </DocumentLetterhead>
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .receipt-document {
            color: #101828;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  )
}
