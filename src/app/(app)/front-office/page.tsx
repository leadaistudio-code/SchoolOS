import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { listAppointments, listTodayVisitors } from '@/server/modules/front-office/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import {
  AppointmentForm,
  AppointmentStatusButtons,
  CheckInForm,
  VisitorRowActions,
} from './forms'

export const metadata = { title: 'Front office' }

export default async function FrontOfficePage() {
  const ctx = await requireContext('frontoffice.view')
  const [visitors, appointments] = await Promise.all([
    listTodayVisitors(ctx),
    listAppointments(ctx),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Front office"
        description="Visitors at the desk and appointments for today."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
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

          <Card>
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
            <Card>
              <CardHeader>
                <CardTitle>Check in</CardTitle>
              </CardHeader>
              <CardContent>
                <CheckInForm />
              </CardContent>
            </Card>
            <Card>
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
