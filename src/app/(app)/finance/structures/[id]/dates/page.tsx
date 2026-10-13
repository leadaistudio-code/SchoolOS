import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { getFeeStructureSchedule } from '@/server/modules/finance/simplicity'
import { ApiException } from '@/server/api/response'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { BillingDatesForm } from './billing-dates-form'

export const metadata = { title: 'Billing dates' }

export default async function StructureBillingDatesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireContext('fees.structure')
  const { id } = await params
  const schedule = await getFeeStructureSchedule(ctx, id).catch((error) => {
    if (error instanceof ApiException) notFound()
    throw error
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Billing dates · ${schedule.name}`}
        description={`${schedule.className} · ${schedule.sessionName}. Set when each installment's invoices are generated and when they are due — optional fees included.`}
        breadcrumbs={[
          { label: 'Fees & Collections', href: '/finance' },
          { label: 'Fee structure', href: '/finance/structures' },
          { label: 'Billing dates' },
        ]}
        actions={<BackButton fallbackHref="/finance/structures" />}
      />
      <BillingDatesForm schedule={schedule} currency={ctx.tenant.currency} />
    </div>
  )
}
