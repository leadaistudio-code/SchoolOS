'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  BadgeCheck,
  Clock,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  SatelliteDish,
  Users,
  WifiOff,
} from 'lucide-react'
import { RouteMap } from '@/components/transport/route-map'
import { BusAvatar, BusGlyph } from '@/components/transport/bus-glyph'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { formatDistance } from '@/lib/geo'
import { cn } from '@/lib/utils'
import type { TrackedBus, TrackingSnapshot } from '@/server/modules/transport/tracking'

/** Fast enough to feel live, slow enough that a phone on mobile data survives it. */
const POLL_MS = 15_000

export function LiveTracking({
  initial,
  mapsKey,
}: {
  initial: TrackingSnapshot
  /** Null when no tile provider is configured; the drawn map is used instead. */
  mapsKey?: string | null
}) {
  const [snapshot, setSnapshot] = React.useState(initial)
  const [selectedId, setSelectedId] = React.useState<string | null>(initial.buses[0]?.id ?? null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [offline, setOffline] = React.useState(false)

  const load = React.useCallback(async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/v1/transport/tracking', { cache: 'no-store' })
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as { data: TrackingSnapshot }
      setSnapshot(body.data)
      setOffline(false)
    } catch {
      // A failed poll is not an error state worth clearing the map for — the
      // last good picture stays up and the banner says how old it is.
      setOffline(true)
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Polling pauses while the tab is hidden: a parent's phone in a pocket does
  // not need to spend its battery re-fetching a map nobody is looking at.
  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      timer = setInterval(load, POLL_MS)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }

    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        void load()
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  const selected = snapshot.buses.find((b) => b.id === selectedId) ?? snapshot.buses[0] ?? null

  if (snapshot.buses.length === 0) {
    return (
      <Card>
        <EmptyState
          title={snapshot.scoped ? 'No bus to track' : 'No buses are being tracked'}
          description={
            snapshot.scoped
              ? 'None of your children are assigned to school transport at the moment. The school office can add them to a route.'
              : 'Add a bus, give it a route with stops, and it will appear here as soon as a driver starts a trip.'
          }
          action={
            snapshot.scoped ? undefined : (
              <Link href="/transport/buses/new" className="text-sm text-[var(--brand-600)] hover:underline">
                Add a bus
              </Link>
            )
          }
        />
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {offline ? (
        <Notice tone="warning" title="Not receiving updates">
          The map is showing the last position we received. It will catch up on its own once the
          connection returns.
        </Notice>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3 min-w-0">
          {selected ? (
            <>
              <RouteMap
                apiKey={mapsKey}
                className="h-[26rem] sm:h-[32rem]"
                label={selected.code}
                stops={selected.stops}
                position={selected.position}
                trail={selected.trail}
                school={snapshot.school}
                nextStopId={selected.nextStop?.id ?? null}
                stale={selected.stale}
              />
              <BusStatusStrip bus={selected} refreshing={refreshing} onRefresh={load} />
              <RouteStrip bus={selected} />
            </>
          ) : null}
        </div>

        <div className="space-y-3">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>{snapshot.scoped ? "Your children's buses" : 'Fleet'}</CardTitle>
              <span className="text-xs text-ink-subtle tnum">{snapshot.buses.length}</span>
            </CardHeader>
            <ul className="divide-y divide-[var(--border)]">
              {snapshot.buses.map((bus) => (
                <li key={bus.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(bus.id)}
                    aria-current={bus.id === selected?.id ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                      bus.id === selected?.id && 'bg-[var(--brand-50)]',
                    )}
                  >
                    <BusAvatar tone={bus.stale ? 'muted' : bus.trip?.status === 'RUNNING' ? 'success' : 'brand'} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-ink">{bus.code}</span>
                        <TripBadge bus={bus} />
                      </span>
                      <span className="block truncate text-xs text-ink-subtle">
                        {bus.route?.name ?? 'No route'}
                      </span>
                    </span>
                    {bus.nextStop ? (
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tnum text-ink">
                          {bus.nextStop.etaMinutes}m
                        </span>
                        <span className="block text-[11px] text-ink-subtle">to next</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selected ? <DriverCard bus={selected} /> : null}
        </div>
      </div>
    </div>
  )
}

function TripBadge({ bus }: { bus: TrackedBus }) {
  if (bus.stale) {
    return (
      <Badge tone="neutral">
        <WifiOff className="size-3" aria-hidden />
        No signal
      </Badge>
    )
  }
  if (bus.trip?.status === 'RUNNING') {
    return (
      <Badge tone="success" dot>
        On the road
      </Badge>
    )
  }
  return <Badge tone="neutral">Parked</Badge>
}

/**
 * The status line under the map.
 *
 * Answers the three questions a parent actually asks, in the order they ask
 * them: where is it, when does it get to my stop, and is this information
 * current.
 */
function BusStatusStrip({
  bus,
  refreshing,
  onRefresh,
}: {
  bus: TrackedBus
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <BusGlyph className="size-6 text-[var(--brand-600)]" />
        <div>
          <p className="text-sm font-semibold text-ink">
            {bus.code}
            <span className="ml-1.5 font-normal text-ink-subtle">{bus.registrationNo}</span>
          </p>
          <p className="text-xs text-ink-subtle">{bus.route?.name ?? 'No route assigned'}</p>
        </div>
      </div>

      <Stat
        icon={<MapPin className="size-3.5" aria-hidden />}
        label="Next stop"
        value={bus.nextStop?.name ?? '—'}
        sub={bus.nextStop ? formatDistance(bus.nextStop.distanceM) + ' away' : undefined}
      />
      <Stat
        icon={<Clock className="size-3.5" aria-hidden />}
        label="Arriving in"
        value={bus.nextStop ? `${bus.nextStop.etaMinutes} min` : '—'}
        sub={bus.nextStop ? 'estimate' : undefined}
      />
      <Stat
        icon={<Navigation className="size-3.5" aria-hidden />}
        label="Speed"
        value={bus.position?.speedKph != null ? `${Math.round(bus.position.speedKph)} km/h` : '—'}
      />
      <Stat
        icon={<Users className="size-3.5" aria-hidden />}
        label="On board"
        value={`${bus.trip?.onBoard ?? 0} of ${bus.riders}`}
        sub="riders"
      />

      <div className="ml-auto flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-ink-subtle">
          {bus.stale ? (
            <WifiOff className="size-3.5 text-warning" aria-hidden />
          ) : (
            <SatelliteDish className="size-3.5 text-success" aria-hidden />
          )}
          {bus.signalAgeMin === null
            ? 'Never reported'
            : bus.signalAgeMin < 1
              ? 'Updated just now'
              : `Updated ${bus.signalAgeMin} min ago`}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="grid size-7 place-items-center rounded-[var(--radius-sm)] border border-line text-ink-muted transition-colors hover:text-ink"
          aria-label="Refresh now"
        >
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} aria-hidden />
        </button>
      </div>
    </Card>
  )
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-xs text-ink-subtle">
        {icon}
        {label}
      </p>
      <p className="truncate text-sm font-semibold text-ink">{value}</p>
      {sub ? <p className="text-[11px] text-ink-subtle">{sub}</p> : null}
    </div>
  )
}

/** The stop list as a progress rail — done, next, still to come. */
function RouteStrip({ bus }: { bus: TrackedBus }) {
  if (bus.stops.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Stops</CardTitle>
        <span className="text-xs text-ink-subtle tnum">{bus.progressPercent}% covered</span>
      </CardHeader>
      <ol className="flex gap-0 overflow-x-auto scroll-thin px-4 py-4">
        {bus.stops.map((stop, index) => {
          const isNext = stop.id === bus.nextStop?.id
          return (
            <li key={stop.id} className="flex min-w-36 flex-1 items-start gap-2">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                    stop.served
                      ? 'bg-success text-white'
                      : isNext
                        ? 'bg-[var(--brand-500)] text-[var(--brand-contrast)]'
                        : 'bg-surface-3 text-ink-subtle',
                  )}
                >
                  {stop.served ? <BadgeCheck className="size-3.5" aria-hidden /> : index + 1}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-sm',
                    isNext ? 'font-semibold text-ink' : 'text-ink-muted',
                    stop.isOwnStop && 'text-[var(--accent-600)]',
                  )}
                >
                  {stop.name}
                  {stop.isOwnStop ? <span className="ml-1 text-[11px]">· your stop</span> : null}
                </p>
                <p className="text-[11px] text-ink-subtle tnum">
                  {stop.pickupTime ?? '—'}
                  {stop.riders ? ` · ${stop.riders} riders` : ''}
                </p>
              </div>
              {index < bus.stops.length - 1 ? (
                <span
                  className={cn(
                    'mt-3 h-px flex-1 min-w-4',
                    stop.served ? 'bg-success' : 'bg-line-strong',
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

/**
 * Driver and vehicle details.
 *
 * A phone number is the point of this card: when a bus is late, a parent wants
 * the person driving it, not a support form. It is one tap on a phone.
 */
function DriverCard({ bus }: { bus: TrackedBus }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Driver &amp; vehicle</CardTitle>
      </CardHeader>

      <div className="p-4 space-y-4">
        {bus.driver ? (
          <div className="flex items-center gap-3">
            {bus.driver.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bus.driver.photoUrl} alt="" className="size-11 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-3 text-sm font-semibold text-ink-muted">
                {bus.driver.name
                  .split(' ')
                  .map((part) => part.charAt(0))
                  .slice(0, 2)
                  .join('')}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{bus.driver.name}</p>
              <p className="truncate text-xs text-ink-subtle">
                {bus.driver.designation ?? 'Driver'} · {bus.driver.employeeCode}
              </p>
            </div>
          </div>
        ) : (
          <Notice tone="warning" title="No driver assigned">
            This bus has no driver on record. Assign one so families know who is at the wheel.
          </Notice>
        )}

        {bus.driver?.phone ? (
          <a
            href={`tel:${bus.driver.phone}`}
            className="flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-line-strong px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-[var(--brand-500)] hover:text-[var(--brand-600)]"
          >
            <Phone className="size-4" aria-hidden />
            Call {bus.driver.name.split(' ')[0]}
          </a>
        ) : null}

        <dl className="divide-y divide-[var(--border)] text-sm">
          <Row label="Vehicle">{bus.model ?? '—'}</Row>
          <Row label="Registration">{bus.registrationNo}</Row>
          <Row label="Attendant">{bus.attendantName ?? '—'}</Row>
          <Row label="Capacity">
            {bus.riders} of {bus.capacity} seats used
          </Row>
          {bus.ownChildren.length > 0 ? (
            <Row label="Travelling">{bus.ownChildren.join(', ')}</Row>
          ) : null}
        </dl>
      </div>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2 py-2">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}
