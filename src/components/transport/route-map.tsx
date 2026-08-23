'use client'

import * as React from 'react'
import { BusMap, type MapPosition, type MapStop } from './bus-map'
import { TileMap } from './tile-map'
import type { LatLng } from '@/lib/geo'

/**
 * One map, two implementations.
 *
 * Every screen that shows a route renders this, so the decision about which
 * map a school gets is made once rather than at each call site. With a Google
 * key configured it is real tiles — roads, rooftops, the shops parents describe
 * stops by. Without one, or when the SDK cannot be reached, it is the drawn
 * schematic that has always been here.
 *
 * The fallback is not a degraded mode to apologise for. It works on a filtered
 * school network, it costs nothing, and it sends no child's pickup point to a
 * third party — which is why it stays the default rather than being deleted the
 * moment a nicer option exists.
 */
export function RouteMap({
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
}: {
  /** Empty or absent means no tile provider is configured for this school. */
  apiKey?: string | null
  stops: MapStop[]
  position?: MapPosition | null
  trail?: LatLng[]
  school?: { name: string; latitude: number | null; longitude: number | null } | null
  nextStopId?: string | null
  stale?: boolean
  label?: string
  className?: string
  onSelectStop?: (stopId: string) => void
}) {
  // Set once, when the SDK genuinely fails. Kept in state rather than a ref so
  // the fallback actually renders, and never reset — retrying a blocked script
  // on every refresh would just flicker between the two maps.
  const [unavailable, setUnavailable] = React.useState<string | null>(null)

  const shared = { stops, position, trail, school, nextStopId, stale, label, className, onSelectStop }

  if (apiKey && !unavailable) {
    // TileMap renders nothing once it has failed, and reports why through
    // `onUnavailable` — the state change below then swaps in the drawn map.
    return (
      <TileMap
        apiKey={apiKey}
        {...shared}
        onUnavailable={(reason) => {
          console.warn('[MyCampusView] Google Maps unavailable:', reason)
          setUnavailable(reason)
        }}
      />
    )
  }

  return (
    <div className="space-y-1.5">
      <BusMap {...shared} />
      {unavailable ? (
        // A plain sentence, not the raw error. Minified builds produce things
        // like "e.Map is not a constructor", which tells a school office
        // nothing and reads as though the page is broken — the real text goes
        // to the console for whoever is actually debugging it.
        <p className="text-xs text-ink-subtle">
          Showing the schematic map — the satellite map could not load here.
        </p>
      ) : null}
    </div>
  )
}
