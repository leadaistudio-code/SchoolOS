import { requireContext } from '@/server/context'
import { busOptions } from '@/server/modules/transport/service'
import { PageHeader } from '@/components/page-header'
import { RouteForm } from '../route-form'

export const metadata = { title: 'New route' }

export default async function NewRoutePage() {
  const ctx = await requireContext('transport.manage')
  const buses = await busOptions(ctx)

  return (
    <div>
      <PageHeader
        title="New route"
        description="Name the route and pick its bus. Stops are added next, in the order the bus drives them."
        breadcrumbs={[
          { label: 'Transport', href: '/transport' },
          { label: 'Routes & Stops', href: '/transport/routes' },
          { label: 'New' },
        ]}
      />
      <RouteForm buses={buses} />
    </div>
  )
}
