import { requireContext } from '@/server/context'
import { driverOptions } from '@/server/modules/transport/service'
import { PageHeader } from '@/components/page-header'
import { BusForm } from '../bus-form'

export const metadata = { title: 'Add bus' }

export default async function NewBusPage() {
  const ctx = await requireContext('transport.manage')
  const drivers = await driverOptions(ctx)

  return (
    <div>
      <PageHeader
        title="Add a bus"
        breadcrumbs={[
          { label: 'Transport', href: '/transport' },
          { label: 'Buses', href: '/transport/buses' },
          { label: 'Add' },
        ]}
      />
      <BusForm drivers={drivers} />
    </div>
  )
}
