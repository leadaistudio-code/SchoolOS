'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, LocateFixed, Plus, Trash2 } from 'lucide-react'
import { saveStopsAction } from '../../actions'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { IconButton } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { RouteMap } from '@/components/transport/route-map'

export type EditableStop = {
  id?: string
  name: string
  pickupTime: string
  dropTime: string
  latitude: string
  longitude: string
  fare: string
  riders: number
}

function blank(): EditableStop {
  return { name: '', pickupTime: '', dropTime: '', latitude: '', longitude: '', fare: '', riders: 0 }
}

/**
 * The stop list editor.
 *
 * Order is the thing being edited here — a route is its sequence — so stops
 * move with arrows rather than being given a number to keep consistent by
 * hand. The map beside the table redraws as coordinates are typed, which is
 * the only practical way to notice a transposed latitude before a bus is sent
 * to the wrong side of the city.
 */
export function StopEditor({
  routeId,
  initial,
  school,
  mapsKey,
  canManage,
}: {
  routeId: string
  initial: EditableStop[]
  school: { name: string; latitude: number | null; longitude: number | null } | null
  /** Null when no tile provider is configured. */
  mapsKey?: string | null
  canManage: boolean
}) {
  const toast = useToast()
  const [stops, setStops] = React.useState<EditableStop[]>(initial.length > 0 ? initial : [blank()])
  const [saving, setSaving] = React.useState(false)

  const update = (index: number, patch: Partial<EditableStop>) =>
    setStops((current) => current.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)))

  const move = (index: number, delta: number) =>
    setStops((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved!)
      return next
    })

  const remove = (index: number) => {
    const stop = stops[index]
    if (stop?.riders) {
      toast.push({
        tone: 'error',
        title: 'Stop is in use',
        description: `${stop.riders} student${stop.riders === 1 ? '' : 's'} board here. Move them to another stop first.`,
      })
      return
    }
    setStops((current) => current.filter((_, i) => i !== index))
  }

  /** Fills a stop from the device's own position — useful when surveying stops on site. */
  const fillFromDevice = (index: number) => {
    if (!navigator.geolocation) {
      toast.push({ tone: 'error', title: 'Not available', description: 'This device cannot report its location.' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        update(index, {
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }),
      (error) => toast.push({ tone: 'error', title: 'Could not locate', description: error.message }),
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  const save = async () => {
    setSaving(true)
    const result = await saveStopsAction(
      routeId,
      stops.map((stop) => ({
        id: stop.id,
        name: stop.name.trim(),
        pickupTime: stop.pickupTime || '',
        dropTime: stop.dropTime || '',
        latitude: stop.latitude === '' ? null : Number(stop.latitude),
        longitude: stop.longitude === '' ? null : Number(stop.longitude),
        // Fares are entered in rupees and stored in minor units, like every
        // other amount in the product.
        fareMinor: stop.fare === '' ? null : Math.round(Number(stop.fare) * 100),
      })),
    )
    setSaving(false)
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Stops saved' : 'Not saved',
      description: result.message,
    })
  }

  const mapStops = stops
    .map((stop, index) => ({
      id: stop.id ?? `draft-${index}`,
      name: stop.name || `Stop ${index + 1}`,
      sortOrder: index + 1,
      latitude: stop.latitude === '' ? null : Number(stop.latitude),
      longitude: stop.longitude === '' ? null : Number(stop.longitude),
      pickupTime: stop.pickupTime || null,
      riders: stop.riders,
    }))
    .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Stops</CardTitle>
          <span className="text-xs text-ink-subtle tnum">{stops.length} in order</span>
        </CardHeader>

        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-4xl border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <Th className="w-10">#</Th>
                <Th>Stop name</Th>
                <Th className="w-24">Pickup</Th>
                <Th className="w-24">Drop</Th>
                <Th className="w-32">Latitude</Th>
                <Th className="w-32">Longitude</Th>
                <Th className="w-24">Fare</Th>
                <Th className="w-28">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {stops.map((stop, index) => (
                <tr key={stop.id ?? `draft-${index}`} className="border-b border-line last:border-0">
                  <Td className="tnum text-ink-subtle">{index + 1}</Td>
                  <Td>
                    <Input
                      value={stop.name}
                      onChange={(event) => update(index, { name: event.target.value })}
                      placeholder="Green Park Market"
                      aria-label={`Stop ${index + 1} name`}
                      disabled={!canManage}
                    />
                    {stop.riders > 0 ? (
                      <span className="mt-0.5 block text-xs text-ink-subtle">
                        {stop.riders} rider{stop.riders === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Input
                      type="time"
                      value={stop.pickupTime}
                      onChange={(event) => update(index, { pickupTime: event.target.value })}
                      aria-label={`Stop ${index + 1} pickup time`}
                      disabled={!canManage}
                    />
                  </Td>
                  <Td>
                    <Input
                      type="time"
                      value={stop.dropTime}
                      onChange={(event) => update(index, { dropTime: event.target.value })}
                      aria-label={`Stop ${index + 1} drop time`}
                      disabled={!canManage}
                    />
                  </Td>
                  <Td>
                    <Input
                      value={stop.latitude}
                      onChange={(event) => update(index, { latitude: event.target.value })}
                      placeholder="28.4595"
                      inputMode="decimal"
                      aria-label={`Stop ${index + 1} latitude`}
                      disabled={!canManage}
                    />
                  </Td>
                  <Td>
                    <Input
                      value={stop.longitude}
                      onChange={(event) => update(index, { longitude: event.target.value })}
                      placeholder="77.0266"
                      inputMode="decimal"
                      aria-label={`Stop ${index + 1} longitude`}
                      disabled={!canManage}
                    />
                  </Td>
                  <Td>
                    <Input
                      value={stop.fare}
                      onChange={(event) => update(index, { fare: event.target.value })}
                      inputMode="decimal"
                      placeholder="6000"
                      aria-label={`Stop ${index + 1} fare`}
                      disabled={!canManage}
                    />
                  </Td>
                  <Td>
                    {canManage ? (
                      <div className="flex items-center gap-0.5">
                        <IconButton label={`Use my location for stop ${index + 1}`} onClick={() => fillFromDevice(index)}>
                          <LocateFixed className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton label={`Move stop ${index + 1} up`} onClick={() => move(index, -1)}>
                          <ArrowUp className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton label={`Move stop ${index + 1} down`} onClick={() => move(index, 1)}>
                          <ArrowDown className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton label={`Remove stop ${index + 1}`} onClick={() => remove(index)}>
                          <Trash2 className="size-4" aria-hidden />
                        </IconButton>
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManage ? (
          <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
            <Button variant="secondary" size="sm" onClick={() => setStops((c) => [...c, blank()])}>
              <Plus className="size-4" aria-hidden />
              Add stop
            </Button>
            <Button size="sm" onClick={save} loading={saving} className="ml-auto">
              Save stops
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="space-y-2">
        <RouteMap apiKey={mapsKey} className="h-[22rem]" stops={mapStops} school={school} />
        <p className="text-xs text-ink-subtle">
          Stops without coordinates are left off the map and out of arrival estimates. On a phone,
          the crosshair button fills them in from where you are standing.
        </p>
      </div>
    </div>
  )
}

function Th({ className, children }: { className?: string; children: React.ReactNode }) {
  return <th className={`px-3 py-2 text-xs font-medium text-ink-subtle ${className ?? ''}`}>{children}</th>
}

function Td({ className, children }: { className?: string; children: React.ReactNode }) {
  return <td className={`px-3 py-2 align-top ${className ?? ''}`}>{children}</td>
}
