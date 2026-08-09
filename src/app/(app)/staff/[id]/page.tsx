import { formatDay } from '@/lib/dates'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { getStaff } from '@/server/modules/people/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { formatMoney, initials } from '@/lib/utils'

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
          <CardContent className="pt-5">
            <div className="flex items-center gap-3.5">
              <span className="size-16 rounded-full bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center text-xl font-semibold shrink-0">
                {initials(staff.firstName, staff.lastName)}
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-ink truncate">
                  {staff.firstName} {staff.lastName}
                </p>
                <Badge tone="brand" className="mt-1">
                  {staff.staffType.toLowerCase()}
                </Badge>
              </div>
            </div>

            <dl className="mt-5 space-y-2.5 text-[13px]">
              <Row label="Department" value={staff.department ?? '—'} />
              <Row label="Qualification" value={staff.qualification ?? '—'} />
              <Row
                label="Experience"
                value={staff.experienceYears ? `${staff.experienceYears} years` : '—'}
              />
              <Row label="Phone" value={staff.phone ?? '—'} />
              <Row label="Email" value={staff.email ?? '—'} />
              <Row
                label="Joined"
                value={staff.joinedOn ? formatDay(staff.joinedOn, 'd MMM yyyy') : '—'}
              />
              {ctx.can('staff.payroll') ? (
                <Row
                  label="Salary"
                  value={
                    staff.salaryMinor
                      ? formatMoney(staff.salaryMinor, ctx.tenant.currency)
                      : '—'
                  }
                />
              ) : null}
              <Row
                label="Portal login"
                value={
                  staff.user
                    ? `${staff.user.email ?? 'linked'} (${staff.user.status.toLowerCase()})`
                    : 'None'
                }
              />
              <Row
                label="Last sign-in"
                value={
                  staff.user?.lastLoginAt
                    ? format(staff.user.lastLoginAt, 'd MMM yyyy, HH:mm')
                    : 'Never'
                }
              />
            </dl>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Teaching assignments</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
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
                      <li key={cs.id} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="text-[13.5px] text-ink">{cs.subject.name}</span>
                        <span className="text-[12.5px] text-ink-subtle">{cs.classLevel.name}</span>
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
            <CardContent className="pt-0">
              {staff.leaveRequests.length === 0 ? (
                <EmptyState
                  title="No leave requests"
                  description="Leave applied for will appear here."
                />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {staff.leaveRequests.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13.5px] text-ink">
                          {formatDay(l.fromDate, 'd MMM')} – {formatDay(l.toDate, 'd MMM yyyy')}
                        </p>
                        <p className="text-[12px] text-ink-subtle truncate max-w-md">{l.reason}</p>
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
                        {l.status.toLowerCase()}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-subtle shrink-0">{label}</dt>
      <dd className="text-ink text-right break-words">{value}</dd>
    </div>
  )
}
