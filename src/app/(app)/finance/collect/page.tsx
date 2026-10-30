import { requireContext } from '@/server/context'
import { feeCollectorOptions } from '@/server/modules/finance/payments'
import { counterFeeHeads, peekNextBillBookNo } from '@/server/modules/finance/counter'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { CollectForm } from './collect-form'

export const metadata = { title: 'Collect a payment' }

export default async function CollectPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>
}) {
  const ctx = await requireContext('fees.collect')
  const params = await searchParams
  const [collectors, feeHeads, nextBillBookNo] = await Promise.all([
    feeCollectorOptions(ctx),
    counterFeeHeads(ctx),
    peekNextBillBookNo(ctx),
  ])

  return (
    <div>
      <PageHeader
        title="Collect a payment"
        description="Payments settle the oldest invoice first"
        actions={<BackButton fallbackHref={ctx.can('fees.view') ? '/finance' : '/'} />}
      />
      <CollectForm
        currency={ctx.tenant.currency}
        initialStudentId={params.student}
        currentUserId={ctx.user.userId}
        canDiscount={ctx.can('fees.concession')}
        canEditAmounts={
          ctx.can('fees.concession') || ctx.can('fees.invoice') || ctx.can('fees.accounts')
        }
        canViewLedger={ctx.can('fees.view')}
        feeHeads={feeHeads}
        nextBillBookNo={nextBillBookNo}
        collectors={collectors.map((collector) => ({
          id: collector.id,
          name: `${collector.firstName} ${collector.lastName}`,
          employeeCode: collector.staff?.employeeCode ?? null,
        }))}
      />
    </div>
  )
}
