'use client'

import * as React from 'react'
import { Layers, Loader2, Map as MapIcon, Satellite } from 'lucide-react'
import { loadGoogleMaps } from '@/lib/maps-loader'
import { cn } from '@/lib/utils'
import type { MapPosition, MapStop } from './bus-map'

/**
 * The real map.
 *
 * Google tiles, so the school sees actual roads, actual rooftops and the shops
 * their parents describe stops by. This is what the hand-drawn map could never
 * give: our own data knows the order of the stops, not what is around them.
 *
 * Three things it does that a naive integration would not:
 *
 *  1. **It fails into the drawn map rather than into an empty box.** A school
 *     office behind a content filter, an expired card on the Google account, a
 *     mistyped key — all of them end with the SVG map on screen and a line
 *     explaining why, because a blank rectangle where the bus should be is the
 *     worst possible outcome on this screen.
 *  2. **It moves the bus rather than redrawing it.** Positions arrive every
 *     fifteen seconds; tearing down and rebuilding markers would make the whole
 *     map flicker four times a minute.
 *  3. **It only fits the view once.** Re-fitting on every ping would yank the
 *     map out from under somebody who has zoomed in on a junction.
 */

export type MapTypeChoice = 'roadmap' | 'satellite' | 'hybrid'

const TYPE_LABEL: Record<MapTypeChoice, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  roadmap: { label: 'Map', icon: MapIcon },
  satellite: { label: 'Satellite', icon: Satellite },
  hybrid: { label: 'Hybrid', icon: Layers },
}

const STORAGE_KEY = 'mycampusview.map.type'

function busIcon(maps: typeof google.maps, stale: boolean, heading: number | null) {
  const colour = stale ? '#757f8d' : '#2563eb'
  return {
    path: heading === null ? maps.SymbolPath.CIRCLE : maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: heading === null ? 9 : 6,
    fillColor: colour,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2.5,
    rotation: heading ?? 0,
  }
}

function stopIcon(maps: typeof google.maps, done: boolean, isNext: boolean, isOwn: boolean) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: isOwn ? 9 : 7,
    fillColor: done ? '#15803d' : isNext ? '#2563eb' : '#ffffff',
    fillOpacity: 1,
    strokeColor: isOwn ? '#f59e0b' : done || isNext ? '#ffffff' : '#64748b',
    strokeWeight: isOwn ? 3 : 2,
  }
}

export function TileMap({
  apiKey,
  stops,
  position,
  trail = [],
  school,
  nextStopId,
  stale = false,
  label,
  className,
  onSelectStop,
  onUnavailable,
}: {
  apiKey: string
  stops: MapStop[]
  position?: MapPosition | null
  trail?: { latitude: number; longitude: number }[]
  school?: { name: string; latitude: number | null; longitude: number | null } | null
  nextStopId?: string | null
  stale?: boolean
  label?: string
  className?: string
  onSelectStop?: (stopId: string) => void
  /** Called once when the SDK cannot load, so the caller can fall back. */
  onUnavailable?: (reason: string) => void
}) {
  const container = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<google.maps.Map | null>(null)
  const mapsRef = React.useRef<typeof google.maps | null>(null)
  const busMarker = React.useRef<google.maps.Marker | null>(null)
  const stopMarkers = React.useRef<Map<string, google.maps.Marker>>(new Map())
  const routeLine = React.useRef<google.maps.Polyline | null>(null)
  const trailLine = React.useRef<google.maps.Polyline | null>(null)
  const schoolMarker = React.useRef<google.maps.Marker | null>(null)
  const fitted = React.useRef(false)

  const [status, setStatus] = React.useState<'loading' | 'ready' | 'failed'>('loading')
  const [mapType, setMapType] = React.useState<MapTypeChoice>('roadmap')

  // The choice is a per-device preference, not a school setting: one person
  // wants rooftops to find a stop, the next wants street names.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'roadmap' || stored === 'satellite' || stored === 'hybrid') setMapType(stored)
    } catch {
      // Private browsing or blocked storage: the default is fine.
    }
  }, [])

  const located = React.useMemo(
    () =>
      stops.filter(
        (s): s is MapStop & { latitude: number; longitude: number } =>
          typeof s.latitude === 'number' && typeof s.longitude === 'number',
      ),
    [stops],
  )

  /* -- Boot ------------------------------------------------------------- */
  React.useEffect(() => {
    let cancelled = false

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !container.current) return
        mapsRef.current = maps

        mapRef.current = new maps.Map(container.current, {
          center: { lat: 20.5937, lng: 78.9629 },
          zoom: 5,
          mapTypeId: mapType,
          // The stock control cluster fights the app's own chrome; the type
          // switcher below replaces it and the rest is noise on this screen.
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        })

        setStatus('ready')
      })
      .catch((error: Error) => {
        if (cancelled) return
        setStatus('failed')
        onUnavailable?.(error.message)
      })

    return () => {
      cancelled = true
    }
    // Deliberately once: the SDK cannot be reloaded and the map instance is
    // reused for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  /* -- Map type --------------------------------------------------------- */
  React.useEffect(() => {
    mapRef.current?.setMapTypeId(mapType)
    try {
      window.localStorage.setItem(STORAGE_KEY, mapType)
    } catch {
      // Not worth telling anybody about.
    }
  }, [mapType])

  /* -- Stops, route and school ------------------------------------------ */
  React.useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (!maps || !map) return

    const nextIndex = nextStopId ? located.findIndex((s) => s.id === nextStopId) : -1

    // Reconcile rather than rebuild: a marker that already exists is updated in
    // place so the map does not flash on every refresh.
    const seen = new Set<string>()
    located.forEach((stop, index) => {
      seen.add(stop.id)
      const done = nextIndex >= 0 ? index < nextIndex : !!stop.served
      const icon = stopIcon(maps, done, stop.id === nextStopId, !!stop.isOwnStop)
      const existing = stopMarkers.current.get(stop.id)

      if (existing) {
        existing.setPosition({ lat: stop.latitude, lng: stop.longitude })
        existing.setIcon(icon)
        return
      }

      const marker = new maps.Marker({
        map,
        position: { lat: stop.latitude, lng: stop.longitude },
        icon,
        title: `${index + 1}. ${stop.name}${stop.pickupTime ? ` · ${stop.pickupTime}` : ''}`,
        zIndex: 10,
      })
      if (onSelectStop) marker.addListener('click', () => onSelectStop(stop.id))
      stopMarkers.current.set(stop.id, marker)
    })

    for (const [id, marker] of stopMarkers.current) {
      if (!seen.has(id)) {
        marker.setMap(null)
        stopMarkers.current.delete(id)
      }
    }

    const path = located.map((s) => ({ lat: s.latitude, lng: s.longitude }))
    if (routeLine.current) {
      routeLine.current.setPath(path)
    } else if (path.length > 1) {
      routeLine.current = new maps.Polyline({
        map,
        path,
        strokeColor: '#2563eb',
        strokeOpacity: 0.75,
        strokeWeight: 4,
        zIndex: 5,
      })
    }

    if (school && typeof school.latitude === 'number' && typeof school.longitude === 'number') {
      const at = { lat: school.latitude, lng: school.longitude }
      if (schoolMarker.current) {
        schoolMarker.current.setPosition(at)
      } else {
        schoolMarker.current = new maps.Marker({
          map,
          position: at,
          title: school.name,
          zIndex: 8,
          icon: {
            path: maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 8,
            fillColor: '#0f172a',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        })
      }
    }

    // Fit once. After that the view belongs to whoever is looking at it.
    if (!fitted.current && (path.length > 0 || position)) {
      const bounds = new maps.LatLngBounds()
      path.forEach((p) => bounds.extend(p))
      if (position) bounds.extend({ lat: position.latitude, lng: position.longitude })
      if (school?.latitude != null && school.longitude != null) {
        bounds.extend({ lat: school.latitude, lng: school.longitude })
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 56)
        fitted.current = true
      }
    }
  }, [located, nextStopId, school, position, onSelectStop, status])

  /* -- The bus ---------------------------------------------------------- */
  React.useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (!maps || !map) return

    if (!position) {
      busMarker.current?.setMap(null)
      busMarker.current = null
      return
    }

    const at = { lat: position.latitude, lng: position.longitude }
    const icon = busIcon(maps, stale, position.headingDeg ?? null)

    if (busMarker.current) {
      busMarker.current.setPosition(at)
      busMarker.current.setIcon(icon)
    } else {
      busMarker.current = new maps.Marker({
        map,
        position: at,
        icon,
        title: label ? `Bus ${label}` : 'Bus',
        zIndex: 20,
      })
    }
  }, [position, stale, label, status])

  /* -- Where it has been ------------------------------------------------ */
  React.useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (!maps || !map || trail.length < 2) return

    const path = trail.map((p) => ({ lat: p.latitude, lng: p.longitude }))
    if (trailLine.current) {
      trailLine.current.setPath(path)
    } else {
      trailLine.current = new maps.Polyline({
        map,
        path,
        strokeColor: '#2563eb',
        strokeOpacity: 0,
        zIndex: 4,
        icons: [
          {
            icon: { path: maps.SymbolPath.CIRCLE, scale: 2, fillOpacity: 0.6, strokeOpacity: 0.6 },
            offset: '0',
            repeat: '12px',
          },
        ],
      })
    }
  }, [trail, status])

  /* -- Teardown --------------------------------------------------------- */
  React.useEffect(() => {
    const markers = stopMarkers.current
    return () => {
      markers.forEach((m) => m.setMap(null))
      markers.clear()
      busMarker.current?.setMap(null)
      schoolMarker.current?.setMap(null)
      routeLine.current?.setMap(null)
      trailLine.current?.setMap(null)
    }
  }, [])

  if (status === 'failed') return null

  return (
    <div className={cn('relative overflow-hidden rounded-[var(--radius)] border border-line', className)}>
      <div ref={container} className="h-full w-full" role="application" aria-label="Route map" />

      {status === 'loading' ? (
        <div className="absolute inset-0 grid place-items-center bg-surface-2">
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading the map…
          </p>
        </div>
      ) : null}

      <div className="absolute left-2 top-2 flex overflow-hidden rounded-[var(--radius-sm)] border border-line bg-surface/95 backdrop-blur">
        {(Object.keys(TYPE_LABEL) as MapTypeChoice[]).map((type) => {
          const { label: text, icon: Icon } = TYPE_LABEL[type]
          return (
            <button
              key={type}
              type="button"
              onClick={() => setMapType(type)}
              aria-pressed={mapType === type}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors',
                mapType === type
                  ? 'bg-[var(--brand-500)] text-[var(--brand-contrast)]'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              <Icon className="size-3.5" />
              {text}
            </button>
          )
        })}
      </div>
    </div>
  )
}
