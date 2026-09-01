import Link from 'next/link'
import { CalendarDays, CalendarRange, Users } from 'lucide-react'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { listEvents } from '@/server/modules/events/service'
import { ColorBanner, ColorTile } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { CreateEventForm } from './forms'
import { formatNumber } from '@/lib/utils'

export const metadata = { title: 'Events' }

export default async function EventsPage() {
  const ctx = await requireContext('events.view')
  const events = await listEvents(ctx)
  const now = Date.now()
  const upcoming = events.filter((e) => e.startsAt.getTime() >= now).length
  const participants = events.reduce((sum, e) => sum + e._count.participants, 0)

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="admissions"
        eyebrow="Events"
        title={
          events.length > 0
            ? `${formatNumber(events.length)} school events`
            : 'School events'
        }
        description="School events and registrations."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Events"
          value={formatNumber(events.length)}
          sub="On the calendar"
          tone="admissions"
          href="#events-list"
          icon={<CalendarRange className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Upcoming"
          value={formatNumber(upcoming)}
          sub="Still to take place"
          tone="students"
          href="#events-list"
          icon={<CalendarDays className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Registrations"
          value={formatNumber(participants)}
          sub="Across all events"
          tone="parents"
          href="#events-list"
          icon={<Users className="size-5" aria-hidden />}
          delayMs={120}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card id="events-list" variant="elevated" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Calendar · {events.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.length === 0 ? (
              <EmptyState title="No events" description="Create the first school event." />
            ) : (
              events.map((event) => {
                const isUpcoming = event.startsAt.getTime() >= now
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
                      <Badge tone={isUpcoming ? 'brand' : 'neutral'}>
                        {isUpcoming ? 'Upcoming' : 'Past'}
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
          <Card variant="elevated">
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
