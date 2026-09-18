import { requireContext } from '@/server/context'
import { getParent } from '@/server/modules/people/service'
import { PageHeader } from '@/components/page-header'
import { ParentForm } from '../../parent-form'
import { updateParentAction } from '../../actions'

export const metadata = { title: 'Edit parent' }

export default async function EditParentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('parents.edit')
  const parent = await getParent(ctx, id)

  const action = updateParentAction.bind(null, id)

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Edit ${parent.firstName} ${parent.lastName}`}
        description="Update name, contact details and address"
        breadcrumbs={[
          { label: 'Parents', href: '/parents' },
          { label: `${parent.firstName} ${parent.lastName}`, href: `/parents/${id}` },
          { label: 'Edit' },
        ]}
      />
      <ParentForm
        action={action}
        submitLabel="Save changes"
        cancelHref={`/parents/${id}`}
        values={{
          firstName: parent.firstName,
          lastName: parent.lastName,
          phone: parent.phone ?? undefined,
          email: parent.email ?? undefined,
          occupation: parent.occupation ?? undefined,
          annualIncome: parent.annualIncome ?? undefined,
          addressLine1: parent.addressLine1 ?? undefined,
          city: parent.city ?? undefined,
          state: parent.state ?? undefined,
          postalCode: parent.postalCode ?? undefined,
        }}
      />
    </div>
  )
}
