import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { geofenceStatus } from '@/server/modules/staff-attendance/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { GeofenceCheckIn } from './geofence-check-in'
import { attendancePercent, formatDay } from '@/lib/dates'

export const metadata = { title: 'My attendance' }

export default async function MyAttendancePage() {
  const ctx = await requireContext('staff_attendance.mark')
  const status = await geofenceStatus(ctx)

  const staff = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId },
    select: { id: true },
  })

  const [history, grouped] = staff
    ? await Promise.all([
        ctx.db.staffAttendance.findMany({
          where: { staffId: staff.id },
          orderBy: { onDate: 'desc' },
          take: 14,
          select: {
            id: true,
            onDate: true,
            status: true,
            checkInAt: true,
            checkOutAt: true,
            distanceM: true,
            source: true,
            overrideReason: true,
          },
        }),
        ctx.db.staffAttendance.groupBy({
          by: ['status'],
          where: { staffId: staff.id },
          _count: { _all: true },
        }),
      ])
    : [[], []]

  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]))
  const percent = attendancePercent(counts)

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="My attendance"
        description={format(new Date(), 'EEEE, d MMMM yyyy')}
      />

      <Card className="overflow-hidden">
        <GeofenceCheckIn status={status} />
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Recent days</CardTitle>
            <p className="text-[13px] text-ink-muted mt-0.5">
              {percent === null ? 'No history yet' : `${percent}% attendance overall`}
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {history.length === 0 ? (
            <EmptyState
              title="No attendance history"
              description="Days you mark will be listed here."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-ink">{formatDay(h.onDate, 'EEE, d MMM yyyy')}</p>
                    <p className="text-[12px] text-ink-subtle">
                      {h.checkInAt
                        ? `In ${format(h.checkInAt, 'HH:mm')}${h.checkOutAt ? ` · out ${format(h.checkOutAt, 'HH:mm')}` : ''}`
                        : 'No check-in'}
                      {h.distanceM !== null ? ` · ${h.distanceM}m from school` : ''}
                      {h.overrideReason ? ` · corrected: ${h.overrideReason}` : ''}
                    </p>
                  </div>
                  <Badge
                    tone={
                      h.status === 'PRESENT'
                        ? 'success'
                        : h.status === 'LATE'
                          ? 'warning'
                          : h.status === 'ABSENT'
                            ? 'danger'
                            : 'neutral'
                    }
                  >
                    {h.status.toLowerCase().replace('_', ' ')}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
