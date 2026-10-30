import { redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { feeCollectorOptions, getReceipt } from '@/server/modules/finance/payments'
import { toDateInput } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { ReceiptEditor } from './receipt-editor'

export const metadata = { title: 'Edit receipt' }

export default async function EditReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('fees.collect')
  const [payment, collectors] = await Promise.all([getReceipt(ctx, id), feeCollectorOptions(ctx)])
  if (payment.status !== 'SUCCESS' || payment.provider !== 'manual') {
    redirect(`/finance/payments/${payment.id}`)
  }

  const enrollment = payment.student.enrollments[0]
  const guardian = payment.student.guardians[0]?.parent
  const school = ctx.tenant.school

  return (
    <div className="mx-auto max-w-[210mm]">
      <PageHeader
        title={`Edit ${payment.receipt?.number ?? 'receipt'}`}
        description="Change anything on this receipt. Saving keeps the same receipt number; every change is kept in the audit log."
        actions={<BackButton fallbackHref={`/finance/payments/${payment.id}`} />}
      />
      <ReceiptEditor
        currency={ctx.tenant.currency}
        schoolName={school?.name ?? ctx.tenant.name}
        canChangeAmount={ctx.can('fees.reverse')}
        collectors={collectors.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          code: c.staff?.employeeCode ?? null,
        }))}
        receipt={{
          paymentId: payment.id,
          receiptNumber: payment.receipt?.number ?? '—',
          amountMinor: payment.amountMinor,
          mode: payment.mode,
          paidOn: payment.paidAt ? toDateInput(payment.paidAt) : toDateInput(new Date()),
          reference: payment.reference ?? '',
          billBookNo: payment.billBookNo ?? '',
          notes: payment.notes ?? '',
          collectedById: payment.collectedById ?? '',
          hasRefund: payment.refunds.some((r) => r.status !== 'FAILED'),
          splitParts: payment.collection.length,
          studentName: `${payment.student.firstName} ${payment.student.lastName}`,
          admissionNo: payment.student.admissionNo,
          className: enrollment ? `${enrollment.classLevel.name} ${enrollment.section.name}` : '—',
          guardianName: guardian ? `${guardian.firstName} ${guardian.lastName}` : 'Parent / guardian',
          allocations: payment.allocations.map((a) => ({
            id: a.id,
            title: a.invoice.title,
            number: a.invoice.number,
            amountMinor: a.amountMinor,
          })),
          outstandingMinor: payment.outstandingMinor,
        }}
      />
    </div>
  )
}
