'use client'

import * as React from 'react'
import { Radio, Route as RouteIcon, SquareCheck, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { endTripAction, recordBoardingAction, startTripAction } from '../actions'
import type { driverToday } from '@/server/modules/transport/tracking'

type DriverState = Awaited<ReturnType<typeof driverToday>>

/** How often the device reports in while a trip is running. */
const PING_MS = 20_000

/**
 * The driver's half of live tracking.
 *
 * A driver is holding a phone at a wheel, so this is three controls: start the
 * trip, mark children on, end the trip. Position sharing starts and stops with
 * the trip and never runs behind the driver's back — a bus that is not on a
 * school run is not the school's to follow.
 */
export function DriverConsole({
  initial,
  className,
}: {
  initial: DriverState
  className?: string
}) {
  const toast = useToast()
  const [state] = React.useState(initial)
  const [busId, setBusId] = React.useState(initial.buses[0]?.id ?? '')
  const [direction, setDirection] = React.useState<'PICKUP' | 'DROP'>('PICKUP')
  const [busy, setBusy] = React.useState(false)
  const [pings, setPings] = React.useState(0)
  const [geoError, setGeoError] = React.useState<string | null>(null)
  const [marked, setMarked] = React.useState<Record<string, string>>(() =>
    Object.fromEntries((initial.trip?.boardings ?? []).map((b) => [b.studentId, b.event])),
  )

  const trip = state.trip
  const selectedBus = state.buses.find((b) => b.id === busId) ?? null

  // Position sharing lives for exactly as long as the trip does.
  React.useEffect(() => {
    if (!trip) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('This device cannot report its location.')
      return
    }

    let latest: GeolocationPosition | null = null

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        latest = position
        setGeoError(null)
      },
      (error) => setGeoError(error.message),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )

    // The watch fires far more often than the map needs; sending on a timer
    // instead keeps the write rate predictable and the battery alive.
    const send = async () => {
      const fix = latest
      if (!fix) return
      try {
        await fetch('/api/v1/transport/ping', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            busId: trip.bus.id,
            tripId: trip.id,
            latitude: fix.coords.latitude,
            longitude: fix.coords.longitude,
            speedKph: fix.coords.speed == null ? null : Math.max(0, fix.coords.speed * 3.6),
            headingDeg: Number.isFinite(fix.coords.heading) ? fix.coords.heading : null,
            accuracyM: fix.coords.accuracy,
          }),
        })
        setPings((n) => n + 1)
      } catch {
        // A dropped ping is normal in a dead spot; the next one carries the
        // position forward, so it is not worth interrupting the driver over.
      }
    }

    const timer = setInterval(send, PING_MS)
    void send()

    return () => {
      navigator.geolocation.clearWatch(watchId)
      clearInterval(timer)
    }
  }, [trip])

  const start = async () => {
    const routeId = selectedBus?.routes[0]?.id
    if (!busId || !routeId) {
      toast.push({ tone: 'error', title: 'No route', description: 'This bus has no route to run.' })
      return
    }
    setBusy(true)
    const result = await startTripAction(busId, routeId, direction)
    setBusy(false)
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Trip started' : 'Could not start',
      description: result.message,
    })
  }

  const end = async () => {
    if (!trip) return
    setBusy(true)
    const result = await endTripAction(trip.id)
    setBusy(false)
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Trip ended' : 'Could not end trip',
      description: result.message,
    })
  }

  const mark = async (studentId: string, stopId: string | null, event: 'BOARDED' | 'ABSENT') => {
    if (!trip) return
    setMarked((current) => ({ ...current, [studentId]: event }))
    const result = await recordBoardingAction(trip.id, studentId, stopId, event)
    if (!result.ok) {
      setMarked((current) => {
        const next = { ...current }
        delete next[studentId]
        return next
      })
      toast.push({ tone: 'error', title: 'Not recorded', description: result.message })
    }
  }

  if (state.buses.length === 0 && !trip) return null

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader>
        <CardTitle>Driver console</CardTitle>
        {trip ? (
          <Badge tone="success" dot>
            Sharing location · {pings} update{pings === 1 ? '' : 's'} sent
          </Badge>
        ) : (
          <Badge tone="neutral">Not on a trip</Badge>
        )}
      </CardHeader>

      <div className="space-y-4 p-4">
        {geoError ? (
          <Notice tone="warning" title="Location not available">
            {geoError} The school cannot see the bus until this device can report its position.
          </Notice>
        ) : null}

        {trip ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-ink">
                <RouteIcon className="size-4 text-ink-subtle" aria-hidden />
                <span className="font-medium">{trip.route.name}</span>
                <span className="text-ink-subtle">
                  · {trip.bus.code} · {trip.direction === 'PICKUP' ? 'Morning pickup' : 'Afternoon drop'}
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={end} loading={busy}>
                End trip
              </Button>
            </div>

            <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-line">
              {state.roster.map((rider) => {
                const status = marked[rider.student.id]
                return (
                  <li key={rider.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">
                        {rider.student.firstName} {rider.student.lastName}
                      </span>
                      <span className="block truncate text-xs text-ink-subtle">
                        {rider.stop.name} · {rider.student.admissionNo}
                      </span>
                    </span>

                    {status ? (
                      <Badge tone={status === 'BOARDED' ? 'success' : 'danger'}>
                        {status === 'BOARDED' ? 'On board' : 'Absent'}
                      </Badge>
                    ) : (
                      <span className="flex shrink-0 gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => mark(rider.student.id, rider.stop.id, 'BOARDED')}
                        >
                          <SquareCheck className="size-4" aria-hidden />
                          On
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => mark(rider.student.id, rider.stop.id, 'ABSENT')}
                        >
                          <UserX className="size-4" aria-hidden />
                          Absent
                        </Button>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-44 flex-1">
              <span className="mb-1 block text-sm font-medium text-ink">Bus</span>
              <Select value={busId} onChange={(event) => setBusId(event.target.value)}>
                {state.buses.map((bus) => (
                  <option key={bus.id} value={bus.id}>
                    {bus.code} · {bus.registrationNo}
                  </option>
                ))}
              </Select>
            </label>
            <label className="min-w-40 flex-1">
              <span className="mb-1 block text-sm font-medium text-ink">Direction</span>
              <Select
                value={direction}
                onChange={(event) => setDirection(event.target.value as 'PICKUP' | 'DROP')}
              >
                <option value="PICKUP">Morning pickup</option>
                <option value="DROP">Afternoon drop</option>
              </Select>
            </label>
            <Button onClick={start} loading={busy}>
              <Radio className="size-4" aria-hidden />
              Start trip
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
