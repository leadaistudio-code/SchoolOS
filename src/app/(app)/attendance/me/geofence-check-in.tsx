'use client'

import * as React from 'react'
import { CheckCircle2, Loader2, LocateFixed, LogOut, MapPin, ShieldAlert } from 'lucide-react'
import { checkInAction, checkOutAction, type CheckInState } from '../actions'
import type { GeofenceStatus } from '@/server/modules/staff-attendance/service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { distanceMeters, formatDistance } from '@/lib/geo'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'locating' | 'submitting' | 'done'

/**
 * Geofenced staff check-in.
 *
 * The browser is asked for a position and reports it. Whether that position is
 * inside the school is decided on the server against coordinates held in the
 * database — this component cannot grant itself attendance. The live distance
 * shown here is a courtesy readout so a teacher knows whether to walk closer;
 * it is not what the server trusts.
 */
export function GeofenceCheckIn({ status }: { status: GeofenceStatus }) {
  const toast = useToast()
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [result, setResult] = React.useState<CheckInState | null>(null)
  const [live, setLive] = React.useState<{ distanceM: number; accuracyM: number } | null>(null)
  const [geoError, setGeoError] = React.useState<string | null>(null)

  const alreadyIn = !!status.today.checkInAt
  const alreadyOut = !!status.today.checkOutAt

  // A live readout while the page is open, so the "you are inside" state is not
  // a surprise at the moment of tapping.
  React.useEffect(() => {
    if (!status.configured || !status.school || alreadyIn) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null)
        setLive({
          distanceM: distanceMeters(status.school!, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
          accuracyM: Math.round(pos.coords.accuracy),
        })
      },
      (err) => setGeoError(describeGeoError(err)),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [status.configured, status.school, alreadyIn])

  const insideByReadout = live !== null && live.distanceM - live.accuracyM <= status.radiusM

  const submit = () => {
    if (!navigator.geolocation) {
      setGeoError('This device cannot report its location.')
      return
    }
    setPhase('locating')

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setPhase('submitting')
        const state = await checkInAction({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          // Some platforms expose this; when absent the server still records
          // the evidence for review.
          mockLocation: Boolean((pos.coords as unknown as { mocked?: boolean }).mocked),
          deviceInfo: navigator.userAgent.slice(0, 180),
        })
        setResult(state)
        setPhase('done')
        toast.push({
          tone: state.ok ? 'success' : 'error',
          title: state.ok ? 'Attendance marked' : 'Not marked',
          description: state.message,
        })
      },
      (err) => {
        setPhase('idle')
        setGeoError(describeGeoError(err))
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  }

  const doCheckOut = async () => {
    setPhase('submitting')
    const state = await checkOutAction()
    setResult(state)
    setPhase('done')
    toast.push({
      tone: state.ok ? 'success' : 'error',
      title: state.ok ? 'Checked out' : 'Could not check out',
      description: state.message,
    })
  }

  if (!status.configured) {
    return (
      <div className="text-center px-6 py-12">
        <div className="size-12 rounded-full bg-warning-bg text-warning grid place-items-center mx-auto mb-4">
          <ShieldAlert className="size-6" aria-hidden />
        </div>
        <p className="text-[15px] font-semibold text-ink">School location not configured</p>
        <p className="text-[13.5px] text-ink-muted mt-1.5 max-w-sm mx-auto">
          An administrator needs to set the school coordinates and geofence radius in Settings
          before attendance can be marked from a device.
        </p>
      </div>
    )
  }

  return (
    <div className="px-5 py-6">
      {/* Proximity ring. Fills as you approach, so the state is legible at a glance. */}
      <div className="flex flex-col items-center text-center">
        <div
          className={cn(
            'relative size-40 rounded-full grid place-items-center transition-colors',
            alreadyIn
              ? 'bg-success-bg'
              : insideByReadout
                ? 'bg-success-bg'
                : live
                  ? 'bg-warning-bg'
                  : 'bg-surface-2',
          )}
        >
          <div
            className={cn(
              'absolute inset-3 rounded-full border-2 border-dashed',
              alreadyIn || insideByReadout
                ? 'border-[color-mix(in_srgb,var(--success)_45%,transparent)]'
                : 'border-line',
            )}
            aria-hidden
          />
          {alreadyIn ? (
            <CheckCircle2 className="size-12 text-success" aria-hidden />
          ) : phase === 'locating' || phase === 'submitting' ? (
            <Loader2 className="size-10 text-ink-muted animate-spin" aria-hidden />
          ) : (
            <MapPin
              className={cn('size-12', insideByReadout ? 'text-success' : 'text-ink-subtle')}
              aria-hidden
            />
          )}
        </div>

        <p className="mt-5 text-[17px] font-semibold text-ink">
          {alreadyIn
            ? 'Attendance already marked today'
            : insideByReadout
              ? 'You are inside the school area'
              : live
                ? `About ${formatDistance(live.distanceM)} from school`
                : 'Checking your location...'}
        </p>

        <p className="text-[13px] text-ink-muted mt-1">
          {status.schoolName} · geofence radius {status.radiusM}m
          {live ? ` · accuracy ±${live.accuracyM}m` : ''}
        </p>

        {alreadyIn ? (
          <div className="flex items-center gap-2 mt-3">
            <Badge tone={status.today.status === 'LATE' ? 'warning' : 'success'}>
              {String(status.today.status ?? '').toLowerCase() || 'present'}
            </Badge>
            <span className="text-[12.5px] text-ink-subtle">
              in at{' '}
              {new Date(status.today.checkInAt!).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {alreadyOut
                ? ` · out at ${new Date(status.today.checkOutAt!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </span>
          </div>
        ) : null}

        {geoError ? (
          <p className="mt-3 text-[13px] text-[var(--danger)] max-w-sm" role="alert">
            {geoError}
          </p>
        ) : null}

        {result && !result.ok ? (
          <p className="mt-3 text-[13px] text-[var(--danger)] max-w-sm" role="alert">
            {result.message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {!alreadyIn ? (
            <Button
              size="lg"
              onClick={submit}
              loading={phase === 'locating' || phase === 'submitting'}
              disabled={!!geoError && !live}
            >
              <LocateFixed className="size-5" aria-hidden />
              Mark my attendance
            </Button>
          ) : !alreadyOut ? (
            <Button size="lg" variant="secondary" onClick={doCheckOut} loading={phase === 'submitting'}>
              <LogOut className="size-5" aria-hidden />
              Check out
            </Button>
          ) : (
            <p className="text-[13.5px] text-ink-muted">Your day is recorded. See you tomorrow.</p>
          )}
        </div>

        <p className="mt-5 text-[12px] text-ink-subtle max-w-sm">
          Your location is checked on the server and stored with this attendance record. It is used
          only to confirm you were on campus.
        </p>
      </div>
    </div>
  )
}

function describeGeoError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission was denied. Enable location access for this site, then try again.'
    case err.POSITION_UNAVAILABLE:
      return 'Your location could not be determined. Move to an open area and try again.'
    case err.TIMEOUT:
      return 'Getting your location took too long. Please try again.'
    default:
      return 'Your location could not be read.'
  }
}
