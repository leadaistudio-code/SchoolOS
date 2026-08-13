import Link from 'next/link'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { listEvents } from '@/server/modules/events/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { CreateEventForm } from './forms'

export const metadata = { title: 'Events' }

export default async function EventsPage() {
  const ctx = await requireContext('events.view')
  const events = await listEvents(ctx)
  const now = Date.now()

  return (
    <div className="space-y-6">
      <PageHeader title="Events" description="School events and registrations." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Calendar · {events.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.length === 0 ? (
              <EmptyState title="No events" description="Create the first school event." />
            ) : (
              events.map((event) => {
                const upcoming = event.startsAt.getTime() >= now
                return (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="flex items-center justify-between rounded-[var(--radius-sm)] border border-line p-3 hover:bg-surface-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">{event.title}</p>
                      <p className="text-xs text-ink-subtle">
                        {format(event.startsAt, 'd MMM yyyy HH:mm')}
                        {event.venue ? ` · ${event.venue}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={upcoming ? 'brand' : 'neutral'}>
                        {upcoming ? 'Upcoming' : 'Past'}
                      </Badge>
                      <span className="text-xs text-ink-subtle tnum">
                        {event._count.participants}
                      </span>
                    </div>
                  </Link>
                )
              })
            )}
          </CardContent>
        </Card>

        {ctx.can('events.manage') ? (
          <Card>
            <CardHeader>
              <CardTitle>New event</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateEventForm />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
