import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { requireContext } from '@/server/context'
import { calendarMonth, upcomingEvents } from '@/server/modules/academics/content-service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, humanizeStatus } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export const metadata = { title: 'School calendar' }

const KIND_TONE: Record<string, string> = {
  HOLIDAY: 'bg-danger-bg text-[var(--danger)]',
  EXAM: 'bg-warning-bg text-warning',
  PTM: 'bg-info-bg text-info',
  EVENT: 'bg-[var(--brand-50)] text-[var(--brand-700)]',
  ACTIVITY: 'bg-success-bg text-success',
  FUNCTION: 'bg-[var(--brand-50)] text-[var(--brand-700)]',
  OTHER: 'bg-surface-2 text-ink-muted',
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const ctx = await requireContext('calendar.view')
  const params = await searchParams

  const [month, upcoming] = await Promise.all([
    calendarMonth(ctx, params.month),
    upcomingEvents(ctx, 8),
  ])

  const anchor = new Date(`${month.month}-01T00:00:00Z`)
  const prev = shiftMonth(month.month, -1)
  const next = shiftMonth(month.month, 1)

  const monthLabel = anchor.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div>
      <PageHeader
        title="School calendar"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px] items-start">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-3 border-b border-line">
            <p className="text-base font-semibold text-ink">{monthLabel}</p>
            <div className="flex items-center gap-1.5">
              <Link
                href={`/academics/calendar?month=${prev}`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Link>
              <Link
                href="/academics/calendar"
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Today
              </Link>
              <Link
                href={`/academics/calendar?month=${next}`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                aria-label="Next month"
              >
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle text-center"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {month.days.map((day) => (
              <div
                key={day.date}
                className={cn(
                  'min-h-24 border-b border-r border-line p-1.5 last-of-type:border-r-0',
                  !day.inMonth && 'bg-surface-2/60',
                  day.isSunday && day.inMonth && 'bg-surface-2/40',
                )}
              >
                <span
                  className={cn(
                    'inline-grid place-items-center size-6 rounded-full text-xs tnum',
                    day.isToday
                      ? 'bg-[var(--brand-500)] text-[var(--brand-contrast)] font-semibold'
                      : day.inMonth
                        ? 'text-ink'
                        : 'text-ink-subtle',
                  )}
                >
                  {Number(day.date.slice(8, 10))}
                </span>

                <div className="mt-1 space-y-1">
                  {day.events.slice(0, 3).map((e) => (
                    <div
                      key={`${day.date}-${e.id}`}
                      title={e.title}
                      className={cn(
                        'truncate rounded-[4px] px-1.5 py-0.5 text-xs leading-4',
                        KIND_TONE[e.kind] ?? KIND_TONE.OTHER,
                      )}
                    >
                      {e.title}
                    </div>
                  ))}
                  {day.events.length > 3 ? (
                    <p className="text-xs text-ink-subtle px-1.5">
                      +{day.events.length - 3} more
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {upcoming.length === 0 ? (
              <EmptyState
                title="Nothing scheduled"
                description="Events added to the calendar will appear here."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {upcoming.map((e) => (
                  <li key={e.id} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-ink truncate">{e.title}</p>
                        <p className="text-xs text-ink-subtle">
                          {e.startsAt.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            timeZone: 'UTC',
                          })}
                          {e.location ? ` · ${e.location}` : ''}
                        </p>
                      </div>
                      <Badge tone="neutral">{humanizeStatus(e.kind)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(year, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}
