import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { StaffForm } from '../staff-form'
import { createStaffAction } from '../actions'

export const metadata = { title: 'Add staff' }

export default async function NewStaffPage() {
  const ctx = await requireContext('staff.create')

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Add a staff member"
        description="Teaching and support staff both live here. Only the code, name and type are required."
        breadcrumbs={[{ label: 'Teachers & staff', href: '/staff' }, { label: 'Add' }]}
      />
      <StaffForm
        action={createStaffAction}
        canSetSalary={ctx.can('staff.payroll_manage')}
        canCreateLogin={ctx.can('users.create')}
        submitLabel="Add staff member"
        cancelHref="/staff"
      />
    </div>
  )
}
