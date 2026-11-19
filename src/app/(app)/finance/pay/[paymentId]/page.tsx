import { notFound, redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { accessibleStudentIds, isPortalOnlyRole } from '@/server/scope'
import { feeRazorpayKeys } from '@/server/modules/finance/razorpay-fees'
import { PageHeader } from '@/components/page-header'
import { FeeCheckoutClient } from './checkout-client'

export const metadata = { title: 'Pay fees' }

export default async function FeePayPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const ctx = await requireContext('fees.view')
  const { paymentId } = await params

  const payment = await ctx.db.feePayment.findFirst({
    where: { id: paymentId },
    select: {
      id: true,
      studentId: true,
      amountMinor: true,
      currency: true,
      status: true,
      provider: true,
      providerOrderId: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
          guardians: {
            where: isPortalOnlyRole(ctx.user.roleKeys)
              ? { parent: { userId: ctx.user.userId } }
              : { isPrimary: true },
            take: 1,
            select: { parent: { select: { firstName: true, email: true, phone: true } } },
          },
        },
      },
    },
  })
  if (!payment || payment.provider !== 'razorpay' || !payment.providerOrderId) notFound()

  const allowed = await accessibleStudentIds(ctx)
  if (allowed !== null && !allowed.includes(payment.studentId)) notFound()

  if (payment.status === 'SUCCESS') redirect(`/finance/payments/${payment.id}`)
  if (payment.status === 'FAILED' || payment.status === 'CANCELLED' || payment.status === 'REFUNDED') {
    redirect('/finance')
  }

  const keys = await feeRazorpayKeys(ctx.tenant.id)
  if (!keys) redirect('/finance')

  const guardian = payment.student.guardians[0]?.parent
  const studentName = `${payment.student.firstName} ${payment.student.lastName}`.trim()

  return (
    <div className="space-y-4 py-8">
      <PageHeader title="Secure payment" description="Complete the payment in the Razorpay window." />
      <FeeCheckoutClient
        paymentId={payment.id}
        providerOrderId={payment.providerOrderId}
        keyId={keys.keyId}
        amountMinor={payment.amountMinor}
        currency={payment.currency}
        schoolName={ctx.tenant.school?.name ?? ctx.tenant.name}
        studentName={studentName}
        prefill={{
          name: guardian?.firstName ?? studentName,
          email: guardian?.email ?? undefined,
          contact: guardian?.phone ?? undefined,
        }}
      />
    </div>
  )
}
