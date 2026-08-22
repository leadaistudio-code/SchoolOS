'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Crosshair, ExternalLink, Link2, MapPin, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { googleMapsLink, isValidLatLng, parseLocationInput } from '@/lib/geo-input'
import { resolveShortLinkAction, saveSchoolLocationAction } from './actions'

/**
 * Setting the school's position.
 *
 * Three ways in, because the three people who might do this work differently:
 * the office manager pastes the link somebody shared on WhatsApp, the
 * administrator types coordinates from a document, and whoever is actually
 * standing in the building just presses the button. Making any one of them the
 * only route is how this field stays empty.
 *
 * The preview below the inputs is not decoration. A transposed latitude and
 * longitude is the single most common mistake here and produces a perfectly
 * valid-looking pair — the only practical defence is showing the point on a map
 * before it is saved.
 */
export function LocationForm({
  school,
  canManage,
}: {
  school: {
    name: string
    latitude: number | null
    longitude: number | null
    geofenceRadiusM: number
    address: string
    isSet: boolean
  }
  canManage: boolean
}) {
  const router = useRouter()
  const toast = useToast()

  const [latitude, setLatitude] = React.useState(school.latitude?.toString() ?? '')
  const [longitude, setLongitude] = React.useState(school.longitude?.toString() ?? '')
  const [radius, setRadius] = React.useState(school.geofenceRadiusM)
  const [paste, setPaste] = React.useState('')
  const [pasteNote, setPasteNote] = React.useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [pending, start] = React.useTransition()
  const [locating, setLocating] = React.useState(false)

  const lat = Number(latitude)
  const lng = Number(longitude)
  const valid = isValidLatLng(lat, lng)

  const apply = (value: { latitude: number; longitude: number }, how: string) => {
    setLatitude(value.latitude.toString())
    setLongitude(value.longitude.toString())
    setPasteNote({ tone: 'ok', text: `Read from ${how}. Check the preview before saving.` })
  }

  const readPaste = () =>
    start(async () => {
      const result = parseLocationInput(paste)

      if (result.ok) {
        apply(result.value, result.source)
        return
      }

      if (result.reason === 'NEEDS_RESOLVING') {
        setPasteNote({ tone: 'ok', text: 'Expanding the short link…' })
        const resolved = await resolveShortLinkAction(result.url)
        if (resolved.ok && resolved.data) {
          apply(resolved.data, 'the expanded link')
        } else {
          setPasteNote({ tone: 'bad', text: resolved.message })
        }
        return
      }

      setPasteNote({ tone: 'bad', text: result.message })
    })

  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPasteNote({ tone: 'bad', text: 'This device cannot report its location.' })
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        apply(
          {
            latitude: Math.round(position.coords.latitude * 1e6) / 1e6,
            longitude: Math.round(position.coords.longitude * 1e6) / 1e6,
          },
          `this device (±${Math.round(position.coords.accuracy)} m)`,
        )
      },
      (error) => {
        setLocating(false)
        setPasteNote({ tone: 'bad', text: error.message })
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  const save = () =>
    start(async () => {
      const result = await saveSchoolLocationAction({
        latitude: lat,
        longitude: lng,
        geofenceRadiusM: radius,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Location saved' : 'Could not save',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <div className="space-y-4">
        {!school.isSet ? (
          <Notice tone="warning" title="No location set yet">
            Staff check-in cannot tell who is on the premises until this is set, and the transport
            map has no anchor to draw routes against.
          </Notice>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Paste a map link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-ink-muted">
              Open Google Maps, press and hold on the school, tap Share, and paste what you get.
              Coordinates typed by hand work too — <code className="text-xs">19.0760, 72.8777</code>{' '}
              or <code className="text-xs">19°04&apos;33.6&quot;N 72°52&apos;39.7&quot;E</code>.
            </p>

            <div className="flex flex-wrap items-end gap-2">
              <Field label="Link or coordinates" htmlFor="loc-paste" className="min-w-64 flex-1">
                <Input
                  id="loc-paste"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="https://maps.app.goo.gl/… or 19.0760, 72.8777"
                  disabled={!canManage}
                />
              </Field>
              <Button variant="secondary" onClick={readPaste} loading={pending} disabled={!canManage || !paste.trim()}>
                <Link2 aria-hidden />
                Read it
              </Button>
              <Button variant="ghost" onClick={useMyLocation} loading={locating} disabled={!canManage}>
                <Crosshair aria-hidden />
                Use my location
              </Button>
            </div>

            {pasteNote ? (
              <Notice tone={pasteNote.tone === 'ok' ? 'info' : 'danger'}>{pasteNote.text}</Notice>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coordinates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Latitude"
                htmlFor="loc-lat"
                required
                hint="Between -90 and 90. In India this is roughly 8 to 37."
              >
                <Input
                  id="loc-lat"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  inputMode="decimal"
                  placeholder="19.0760"
                  disabled={!canManage}
                />
              </Field>
              <Field
                label="Longitude"
                htmlFor="loc-lng"
                required
                hint="Between -180 and 180. In India this is roughly 68 to 97."
              >
                <Input
                  id="loc-lng"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  inputMode="decimal"
                  placeholder="72.8777"
                  disabled={!canManage}
                />
              </Field>
            </div>

            <Field
              label="Check-in radius"
              htmlFor="loc-radius"
              hint="How far from this point staff may be and still count as on the premises. A phone is accurate to about 20 m outdoors and far worse indoors, so a radius covering the whole campus plus its gate is safer than a tight one."
            >
              <div className="flex items-center gap-3">
                <input
                  id="loc-radius"
                  type="range"
                  min={50}
                  max={1000}
                  step={10}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  disabled={!canManage}
                  className="flex-1 accent-[var(--brand-500)]"
                />
                <span className="w-20 shrink-0 text-right text-sm font-medium tnum text-ink">
                  {radius} m
                </span>
              </div>
            </Field>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button onClick={save} loading={pending} disabled={!canManage || !valid}>
                <Save aria-hidden />
                Save location
              </Button>
              {!valid && (latitude || longitude) ? (
                <span className="text-xs text-[var(--danger)]">
                  Those coordinates are not a real place
                </span>
              ) : null}
              {!canManage ? (
                <span className="text-xs text-ink-subtle">
                  You can see this but not change it
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Check before saving</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{school.name}</p>
              {school.address ? (
                <p className="text-xs text-ink-subtle">{school.address}</p>
              ) : null}
            </div>
          </div>

          {valid ? (
            <>
              <p className="font-mono text-sm text-ink tnum">
                {lat}, {lng}
              </p>
              <a
                href={googleMapsLink(lat, lng)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-600)] hover:underline"
              >
                Open this point in Google Maps
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
              <Notice tone="info">
                Open the link and confirm the pin lands on your building. A swapped latitude and
                longitude still looks like a valid pair here but puts the school in the wrong
                country.
              </Notice>
            </>
          ) : (
            <p className="text-sm text-ink-subtle">
              Enter or paste a location and a link to check it will appear here.
            </p>
          )}

          <div className="border-t border-line pt-3">
            <p className="text-xs text-ink-subtle">
              This one point is used by staff check-in and by the transport map. Nothing else reads
              it, and it is never shared outside your school.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
