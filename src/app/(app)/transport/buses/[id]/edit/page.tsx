import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { busDetail, driverOptions } from '@/server/modules/transport/service'
import { toDateInput } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { BusForm } from '../../bus-form'

export const metadata = { title: 'Edit bus' }

export default async function EditBusPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('transport.manage')
  const { id } = await params

  const [detail, drivers] = await Promise.all([
    busDetail(ctx, id).catch(() => null),
    driverOptions(ctx),
  ])
  if (!detail) notFound()

  const { bus } = detail

  return (
    <div>
      <PageHeader
        title={`Edit ${bus.code}`}
        breadcrumbs={[
          { label: 'Transport', href: '/transport' },
          { label: 'Buses', href: '/transport/buses' },
          { label: bus.code, href: `/transport/buses/${bus.id}` },
          { label: 'Edit' },
        ]}
      />
      <BusForm
        drivers={drivers}
        bus={{
          id: bus.id,
          code: bus.code,
          registrationNo: bus.registrationNo,
          model: bus.model,
          capacity: bus.capacity,
          driverId: bus.driverId,
          attendantName: bus.attendantName,
          insuranceExpiresOn: bus.insuranceExpiresOn ? toDateInput(bus.insuranceExpiresOn) : null,
          fitnessExpiresOn: bus.fitnessExpiresOn ? toDateInput(bus.fitnessExpiresOn) : null,
          pollutionExpiresOn: bus.pollutionExpiresOn ? toDateInput(bus.pollutionExpiresOn) : null,
          isActive: bus.isActive,
        }}
      />
    </div>
  )
}
