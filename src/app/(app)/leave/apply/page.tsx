import { requireContext } from '@/server/context'
import { leaveTypes } from '@/server/modules/leave/service'
import { scopedStudents } from '@/server/scope'
import { isSelfScoped } from '@/lib/rbac/roles'
import { PageHeader } from '@/components/page-header'
import { LeaveForm } from './leave-form'

export const metadata = { title: 'Apply for leave' }

export default async function ApplyLeavePage() {
  const ctx = await requireContext('leave.apply')

  // A parent or student applies for a student; staff apply for themselves.
  // Someone who is both (an office user with a child here) gets the choice.
  const selfScoped = isSelfScoped(ctx.user.roleKeys)

  const staffRecord = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { id: true },
  })

  const [students, studentTypes, staffTypesList] = await Promise.all([
    selfScoped || ctx.can('leave.approve') ? scopedStudents(ctx) : Promise.resolve([]),
    leaveTypes(ctx, 'STUDENT'),
    leaveTypes(ctx, 'STAFF'),
  ])

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Apply for leave"
      />
      <LeaveForm
        students={students}
        studentLeaveTypes={studentTypes}
        staffLeaveTypes={staffTypesList}
        canApplyAsStaff={!!staffRecord}
        canApplyForStudent={students.length > 0}
      />
    </div>
  )
}
