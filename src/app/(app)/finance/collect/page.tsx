import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { CollectForm } from './collect-form'

export const metadata = { title: 'Collect a payment' }

export default async function CollectPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>
}) {
  const ctx = await requireContext('fees.collect')
  const params = await searchParams

  return (
    <div>
      <PageHeader
        title="Collect a payment"
        description="Payments settle the oldest invoice first"
      />
      <CollectForm currency={ctx.tenant.currency} initialStudentId={params.student} />
    </div>
  )
}
