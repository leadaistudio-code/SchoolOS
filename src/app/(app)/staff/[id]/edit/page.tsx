import { requireContext } from '@/server/context'
import { getStaff } from '@/server/modules/people/service'
import { toDateInput } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { StaffForm } from '../../staff-form'
import { updateStaffAction } from '../../actions'

export const metadata = { title: 'Edit staff' }

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('staff.edit')
  const staff = await getStaff(ctx, id)

  const action = updateStaffAction.bind(null, id)

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Edit ${staff.firstName} ${staff.lastName}`}
        description={staff.employeeCode}
        breadcrumbs={[
          { label: 'Teachers & staff', href: '/staff' },
          { label: `${staff.firstName} ${staff.lastName}`, href: `/staff/${id}` },
          { label: 'Edit' },
        ]}
      />
      <StaffForm
        action={action}
        canSetSalary={ctx.can('staff.payroll_manage')}
        canCreateLogin={false}
        submitLabel="Save changes"
        cancelHref={`/staff/${id}`}
        values={{
          employeeCode: staff.employeeCode,
          firstName: staff.firstName,
          lastName: staff.lastName,
          staffType: staff.staffType,
          designation: staff.designation ?? undefined,
          department: staff.department ?? undefined,
          qualification: staff.qualification ?? undefined,
          experienceYears: staff.experienceYears?.toString(),
          gender: staff.gender ?? undefined,
          dateOfBirth: staff.dateOfBirth ? toDateInput(staff.dateOfBirth) : undefined,
          phone: staff.phone ?? undefined,
          email: staff.email ?? undefined,
          joinedOn: staff.joinedOn ? toDateInput(staff.joinedOn) : undefined,
          salary: staff.salaryMinor ? String(staff.salaryMinor / 100) : undefined,
          addressLine1: staff.addressLine1 ?? undefined,
          city: staff.city ?? undefined,
          state: staff.state ?? undefined,
          postalCode: staff.postalCode ?? undefined,
        }}
      />
    </div>
  )
}
