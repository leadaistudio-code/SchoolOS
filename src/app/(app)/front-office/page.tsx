import { CalendarClock, DoorOpen, UserRound } from 'lucide-react'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { listAppointments, listTodayVisitors } from '@/server/modules/front-office/service'
import { ColorBanner, ColorTile } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import {
  AppointmentForm,
  AppointmentStatusButtons,
  CheckInForm,
  VisitorRowActions,
} from './forms'
import { formatNumber } from '@/lib/utils'

export const metadata = { title: 'Front office' }

export default async function FrontOfficePage() {
  const ctx = await requireContext('frontoffice.view')
  const [visitors, appointments] = await Promise.all([
    listTodayVisitors(ctx),
    listAppointments(ctx),
  ])
  const stillIn = visitors.filter((v) => !v.checkOutAt).length
  const scheduled = appointments.filter((a) => a.status === 'SCHEDULED').length

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="parents"
        eyebrow="Front office"
        title={
          visitors.length > 0
            ? `${formatNumber(stillIn)} visitors currently in`
            : 'Front desk today'
        }
        description="Visitors at the desk and appointments for today."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Today’s visitors"
          value={formatNumber(visitors.length)}
          sub={`${formatNumber(stillIn)} still on campus`}
          tone="parents"
          href="#visitors"
          icon={<DoorOpen className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="On campus"
          value={formatNumber(stillIn)}
          sub="Checked in, not out"
          tone="attendance"
          href="#visitors"
          icon={<UserRound className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Appointments"
          value={formatNumber(appointments.length)}
          sub={`${formatNumber(scheduled)} still scheduled`}
          tone="pending"
          href="#appointments"
          icon={<CalendarClock className="size-5" aria-hidden />}
          delayMs={120}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card id="visitors" variant="elevated" className="scroll-mt-20">
            <CardHeader>
              <CardTitle>Today&apos;s visitors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {visitors.length === 0 ? (
                <EmptyState title="No visitors yet" description="Check someone in from the desk form." />
              ) : (
                visitors.map((v) => (
                  <div key={v.id} className="rounded-[var(--radius-sm)] border border-line p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-ink">{v.name}</p>
                      <Badge tone={v.checkOutAt ? 'neutral' : 'success'}>
                        {v.checkOutAt ? 'Out' : 'In'}
                      </Badge>
                      {v.passNumber ? <Badge tone="brand">{v.passNumber}</Badge> : null}
                    </div>
                    <p className="text-xs text-ink-subtle">
                      {format(v.checkInAt, 'HH:mm')} · {v.purpose}
                      {v.toMeet ? ` · meeting ${v.toMeet}` : ''}
                    </p>
                    <VisitorRowActions
                      id={v.id}
                      checkedOut={!!v.checkOutAt}
                      hasPhone={!!v.phone}
                      canManage={ctx.can('frontoffice.manage')}
                      canAdmissions={ctx.can('admissions.manage')}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card id="appointments" variant="elevated" className="scroll-mt-20">
            <CardHeader>
              <CardTitle>Appointments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {appointments.length === 0 ? (
                <EmptyState title="No appointments" description="Schedule one from the side form." />
              ) : (
                appointments.map((a) => (
                  <div key={a.id} className="rounded-[var(--radius-sm)] border border-line p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-ink">{a.title}</p>
                      <Badge tone="neutral">{a.status}</Badge>
                    </div>
                    <p className="text-xs text-ink-subtle">
                      {format(a.scheduledAt, 'd MMM HH:mm')} · {a.visitorName}
                      {a.phone ? ` · ${a.phone}` : ''}
                    </p>
                    {ctx.can('frontoffice.manage') && a.status === 'SCHEDULED' ? (
                      <AppointmentStatusButtons id={a.id} />
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {ctx.can('frontoffice.manage') ? (
          <div className="space-y-6">
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Check in</CardTitle>
              </CardHeader>
              <CardContent>
                <CheckInForm />
              </CardContent>
            </Card>
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>New appointment</CardTitle>
              </CardHeader>
              <CardContent>
                <AppointmentForm />
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  )
}
