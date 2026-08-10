import { formatDay } from '@/lib/dates'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { getStaff } from '@/server/modules/people/service'
import { PageHeader } from '@/components/page-header'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DescriptionItem,
  DescriptionList,
} from '@/components/ui/card'
import { Badge, humanizeStatus } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { formatMoney } from '@/lib/utils'
import { Avatar } from '@/components/ui/identity'

export const metadata = { title: 'Staff profile' }

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('staff.view')
  const staff = await getStaff(ctx, id)

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${staff.firstName} ${staff.lastName}`}
        description={`${staff.employeeCode}${staff.designation ? ` · ${staff.designation}` : ''}`}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent>
            <div className="flex items-center gap-3">
              <Avatar firstName={staff.firstName} lastName={staff.lastName} />
              <div className="min-w-0">
                <p className="text-base font-semibold text-ink truncate">
                  {staff.firstName} {staff.lastName}
                </p>
                <p className="text-sm text-ink-subtle first-letter:uppercase">
                  {staff.staffType.toLowerCase()}
                </p>
              </div>
            </div>

            <DescriptionList className="mt-4">
              <DescriptionItem label="Department">{staff.department ?? '—'}</DescriptionItem>
              <DescriptionItem label="Qualification">{staff.qualification ?? '—'}</DescriptionItem>
              <DescriptionItem label="Experience">{staff.experienceYears ? `${staff.experienceYears} years` : '—'}</DescriptionItem>
              <DescriptionItem label="Phone">{staff.phone ?? '—'}</DescriptionItem>
              <DescriptionItem label="Email">{staff.email ?? '—'}</DescriptionItem>
              <DescriptionItem label="Joined">{staff.joinedOn ? formatDay(staff.joinedOn, 'd MMM yyyy') : '—'}</DescriptionItem>
              {ctx.can('staff.payroll') ? (
                <DescriptionItem label="Salary">{
                    staff.salaryMinor
                      ? formatMoney(staff.salaryMinor, ctx.tenant.currency)
                      : '—'
                  }</DescriptionItem>
              ) : null}
              <DescriptionItem label="Portal login">{
                  staff.user
                    ? `${staff.user.email ?? 'linked'} (${staff.user.status.toLowerCase()})`
                    : 'None'
                }</DescriptionItem>
              <DescriptionItem label="Last sign-in">{
                  staff.user?.lastLoginAt
                    ? format(staff.user.lastLoginAt, 'd MMM yyyy, HH:mm')
                    : 'Never'
                }</DescriptionItem>
            </DescriptionList>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Teaching assignments</CardTitle>
            </CardHeader>
            <CardContent className="py-1">
              {staff.classSubjects.length === 0 && staff.classTeacherOf.length === 0 ? (
                <EmptyState
                  title="No assignments"
                  description="Assign subjects or make this staff member a class teacher from Academics."
                />
              ) : (
                <>
                  {staff.classTeacherOf.length > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {staff.classTeacherOf.map((s) => (
                        <Badge key={s.id} tone="brand">
                          Class teacher · {s.classLevel.name} {s.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <ul className="divide-y divide-[var(--border)]">
                    {staff.classSubjects.map((cs) => (
                      <li key={cs.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-sm text-ink">{cs.subject.name}</span>
                        <span className="text-xs text-ink-subtle">{cs.classLevel.name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent leave</CardTitle>
            </CardHeader>
            <CardContent className="py-1">
              {staff.leaveRequests.length === 0 ? (
                <EmptyState
                  title="No leave requests"
                  description="Leave applied for will appear here."
                />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {staff.leaveRequests.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-ink">
                          {formatDay(l.fromDate, 'd MMM')} – {formatDay(l.toDate, 'd MMM yyyy')}
                        </p>
                        <p className="text-xs text-ink-subtle truncate max-w-md">{l.reason}</p>
                      </div>
                      <Badge
                        tone={
                          l.status === 'APPROVED'
                            ? 'success'
                            : l.status === 'PENDING'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {humanizeStatus(l.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

