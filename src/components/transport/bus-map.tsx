'use client'

import * as React from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { fitProjection, type LatLng } from '@/lib/geo'
import { cn } from '@/lib/utils'

export type MapStop = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  sortOrder: number
  served?: boolean
  isOwnStop?: boolean
  riders?: number
  pickupTime?: string | null
}

export type MapPosition = {
  latitude: number
  longitude: number
  headingDeg?: number | null
  speedKph?: number | null
}

const VIEW = { width: 1000, height: 620, padding: 62 }

// ---------------------------------------------------------------------------
// Path smoothing
// ---------------------------------------------------------------------------

/**
 * A Catmull-Rom spline through the stops, emitted as cubic beziers.
 *
 * Joining stops with straight lines draws a route that no road follows and
 * makes every corner look like a hazard. A gentle curve is not more accurate —
 * we do not have the road geometry — but it reads as "the way the bus goes"
 * rather than as a claim about specific streets.
 */
function smoothPath(points: { x: number; y: number }[], tension = 0.32): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`
  if (points.length === 2) {
    return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`
  }

  let d = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[i + 2] ?? p2

    const c1x = p1.x + ((p2.x - p0.x) * tension) / 2
    const c1y = p1.y + ((p2.y - p0.y) * tension) / 2
    const c2x = p2.x - ((p3.x - p1.x) * tension) / 2
    const c2y = p2.y - ((p3.y - p1.y) * tension) / 2

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])
  return reduced
}

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

/**
 * The live route map.
 *
 * Deliberately self-drawn rather than a tile provider. Two reasons, in order:
 * a map of where a school's children stand each morning should not be sent to
 * a third party on every pane, and a school office on a filtered network still
 * needs the screen to work. What matters operationally — the order of the
 * stops, which are done, where the bus is between them — is all in our own
 * data, so the projection is the only thing a tile layer would have added.
 */
export function BusMap({
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
  const reducedMotion = usePrefersReducedMotion()
  const [view, setView] = React.useState({ scale: 1, x: 0, y: 0 })
  const drag = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const located = React.useMemo(
    () =>
      stops.filter(
        (s): s is MapStop & LatLng =>
          typeof s.latitude === 'number' && typeof s.longitude === 'number',
      ),
    [stops],
  )

  const schoolPoint = React.useMemo(
    () =>
      school && typeof school.latitude === 'number' && typeof school.longitude === 'number'
        ? { latitude: school.latitude, longitude: school.longitude, name: school.name }
        : null,
    [school],
  )

  const project = React.useMemo(() => {
    const points: LatLng[] = [...located]
    if (position) points.push(position)
    if (schoolPoint) points.push(schoolPoint)
    return fitProjection(points, VIEW)
  }, [located, position, schoolPoint])

  React.useEffect(() => {
    setView({ scale: 1, x: 0, y: 0 })
  }, [stops.length])

  if (located.length === 0 && !position) {
    return (
      <div
        className={cn(
          'grid place-items-center rounded-[var(--radius)] border border-dashed border-line-strong bg-surface-2 px-6 py-16 text-center',
          className,
        )}
      >
        <div>
          <p className="text-base font-medium text-ink">Nothing to plot yet</p>
          <p className="mt-1 max-w-sm text-sm text-ink-muted">
            Stops need coordinates before this route can be drawn. Add them from Routes &amp; Stops.
          </p>
        </div>
      </div>
    )
  }

  const stopPoints = located.map((stop) => ({ ...project(stop), stop }))
  const busPoint = position ? project(position) : null
  const schoolXY = schoolPoint ? project(schoolPoint) : null

  const nextIndex = nextStopId ? located.findIndex((s) => s.id === nextStopId) : -1
  const doneCount = nextIndex >= 0 ? nextIndex : located.filter((s) => s.served).length

  const fullPath = smoothPath(stopPoints)
  const donePath = smoothPath(stopPoints.slice(0, Math.max(doneCount, 1)))
  const trailPath = trail.length > 1 ? smoothPath(trail.map(project), 0.2) : ''

  const zoom = (factor: number) =>
    setView((v) => ({ ...v, scale: Math.min(6, Math.max(1, v.scale * factor)) }))

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (view.scale === 1) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, ox: view.x, oy: view.y }
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const start = drag.current
    if (!start) return
    // Screen pixels are converted to viewBox units so a drag tracks the
    // pointer at any container width.
    const rect = event.currentTarget.getBoundingClientRect()
    const unit = VIEW.width / rect.width
    setView((v) => ({
      ...v,
      x: start.ox + (event.clientX - start.x) * unit,
      y: start.oy + (event.clientY - start.y) * unit,
    }))
  }

  const endDrag = () => {
    drag.current = null
  }

  return (
    <div className={cn('relative overflow-hidden rounded-[var(--radius)] border border-line bg-surface-2', className)}>
      <svg
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        className={cn('block h-full w-full touch-none', view.scale > 1 && 'cursor-grab active:cursor-grabbing')}
        role="img"
        aria-label={
          label
            ? `Route map for bus ${label} with ${located.length} stops`
            : `Route map with ${located.length} stops`
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <defs>
          <pattern id="bm-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="var(--border)" strokeWidth="1" opacity="0.55" />
          </pattern>
          <radialGradient id="bm-vignette" cx="50%" cy="45%" r="72%">
            <stop offset="55%" stopColor="var(--surface)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--surface-3)" stopOpacity="0.75" />
          </radialGradient>
          <filter id="bm-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0b1220" floodOpacity="0.28" />
          </filter>
        </defs>

        {/* Ground */}
        <rect width={VIEW.width} height={VIEW.height} fill="var(--surface)" />
        <rect width={VIEW.width} height={VIEW.height} fill="url(#bm-grid)" />
        <rect width={VIEW.width} height={VIEW.height} fill="url(#bm-vignette)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {/* The whole route, then the part already covered painted over it */}
          <path d={fullPath} fill="none" stroke="var(--surface-3)" strokeWidth="14" strokeLinecap="round" />
          <path
            d={fullPath}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="1 12"
            strokeLinejoin="round"
          />
          {doneCount > 1 ? (
            <path
              d={donePath}
              fill="none"
              stroke="var(--brand-500)"
              strokeWidth="4.5"
              strokeLinecap="round"
              opacity="0.9"
            />
          ) : null}

          {/* Where the bus has actually been on this trip */}
          {trailPath ? (
            <path
              d={trailPath}
              fill="none"
              stroke="var(--brand-500)"
              strokeWidth="2.5"
              strokeDasharray="6 7"
              strokeLinecap="round"
              opacity="0.5"
            />
          ) : null}

          {schoolXY ? <SchoolMarker x={schoolXY.x} y={schoolXY.y} name={schoolPoint!.name} /> : null}

          {stopPoints.map(({ x, y, stop }, index) => (
            <StopMarker
              key={stop.id}
              x={x}
              y={y}
              index={index + 1}
              stop={stop}
              isNext={stop.id === nextStopId}
              done={nextIndex >= 0 ? index < nextIndex : !!stop.served}
              reducedMotion={reducedMotion}
              onSelect={onSelectStop}
            />
          ))}

          {busPoint ? (
            <BusMarker
              x={busPoint.x}
              y={busPoint.y}
              heading={position?.headingDeg ?? null}
              stale={stale}
              reducedMotion={reducedMotion}
              label={label}
            />
          ) : null}
        </g>
      </svg>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <MapButton label="Zoom in" onClick={() => zoom(1.5)}>
          <Plus className="size-4" aria-hidden />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoom(1 / 1.5)}>
          <Minus className="size-4" aria-hidden />
        </MapButton>
        <MapButton label="Fit route" onClick={() => setView({ scale: 1, x: 0, y: 0 })}>
          <Maximize2 className="size-4" aria-hidden />
        </MapButton>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-sm)] border border-line bg-surface/90 px-2 py-1 text-xs text-ink-muted backdrop-blur">
        <LegendKey className="bg-[var(--brand-500)]">Covered</LegendKey>
        <LegendKey className="bg-line-strong">Remaining</LegendKey>
        <LegendKey className="bg-success">Stop done</LegendKey>
      </div>
    </div>
  )
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-[var(--radius-sm)] border border-line bg-surface/90 text-ink-muted backdrop-blur transition-colors hover:text-ink"
    >
      {children}
    </button>
  )
}

function LegendKey({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', className)} aria-hidden />
      {children}
    </span>
  )
}

function SchoolMarker({ x, y, name }: { x: number; y: number; name: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="15" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="1.5" />
      <path d="M-7 3 0 -6 7 3v6a1 1 0 0 1-1 1h-4V6H-2v4h-4a1 1 0 0 1-1-1Z" fill="var(--text-muted)" />
      <text
        y="30"
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill="var(--text-muted)"
        style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3 }}
      >
        {name}
      </text>
    </g>
  )
}

function StopMarker({
  x,
  y,
  index,
  stop,
  isNext,
  done,
  reducedMotion,
  onSelect,
}: {
  x: number
  y: number
  index: number
  stop: MapStop
  isNext: boolean
  done: boolean
  reducedMotion: boolean
  onSelect?: (stopId: string) => void
}) {
  const fill = done ? 'var(--success)' : isNext ? 'var(--brand-500)' : 'var(--surface)'
  const text = done || isNext ? '#ffffff' : 'var(--text-muted)'

  return (
    <g
      transform={`translate(${x} ${y})`}
      className={onSelect ? 'cursor-pointer' : undefined}
      onClick={onSelect ? () => onSelect(stop.id) : undefined}
    >
      {/* The stop the signed-in parent's child uses gets a ring of its own, so
          a parent finds their stop without reading every label. */}
      {stop.isOwnStop ? (
        <circle r="20" fill="none" stroke="var(--accent-500)" strokeWidth="2.5" strokeDasharray="4 4" />
      ) : null}

      {isNext && !reducedMotion ? (
        <circle r="13" fill="var(--brand-500)" opacity="0.35">
          <animate attributeName="r" values="13;26;13" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.35;0;0.35" dur="2.4s" repeatCount="indefinite" />
        </circle>
      ) : null}

      <circle r="13" fill={fill} stroke="var(--border-strong)" strokeWidth="1.5" />
      <text y="4.5" textAnchor="middle" fontSize="12" fontWeight="700" fill={text}>
        {index}
      </text>

      <text
        y="-21"
        textAnchor="middle"
        fontSize="12.5"
        fontWeight={isNext || stop.isOwnStop ? 700 : 500}
        fill={isNext ? 'var(--brand-600)' : 'var(--text)'}
        style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3.5 }}
      >
        {stop.name}
      </text>
      {stop.pickupTime ? (
        <text
          y="-8"
          textAnchor="middle"
          fontSize="11"
          fill="var(--text-subtle)"
          style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3 }}
        >
          {stop.pickupTime}
        </text>
      ) : null}
    </g>
  )
}

/**
 * The bus itself.
 *
 * Points the way it is travelling, so a glance says "heading away from us"
 * without reading the speed. When the signal has gone stale the marker greys
 * and stops pulsing rather than disappearing: the last known position is still
 * the most useful thing on the screen, and a vanished bus reads as a crash.
 */
function BusMarker({
  x,
  y,
  heading,
  stale,
  reducedMotion,
  label,
}: {
  x: number
  y: number
  heading: number | null
  stale: boolean
  reducedMotion: boolean
  label?: string
}) {
  const body = stale ? 'var(--text-subtle)' : 'var(--brand-500)'

  return (
    <g transform={`translate(${x} ${y})`}>
      {!stale && !reducedMotion ? (
        <circle r="20" fill="var(--brand-500)" opacity="0.25">
          <animate attributeName="r" values="20;40;20" dur="2.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.28;0;0.28" dur="2.8s" repeatCount="indefinite" />
        </circle>
      ) : null}

      {heading !== null ? (
        <g transform={`rotate(${heading})`}>
          <path d="M0 -34 L7 -21 L-7 -21 Z" fill={body} opacity="0.85" />
        </g>
      ) : null}

      <circle r="19" fill="var(--surface)" filter="url(#bm-shadow)" />
      <circle r="19" fill={body} />

      {/* The bus mark, scaled from the 24px glyph to the marker */}
      <g transform="translate(-10.5 -10.5) scale(0.875)" fill="#ffffff">
        <path d="M4.4 4.8c0-1 .8-1.8 1.8-1.8h11.6c1 0 1.8.8 1.8 1.8v11.9c0 .7-.4 1.3-1 1.6v1.4c0 .7-.6 1.3-1.3 1.3h-.9c-.7 0-1.3-.6-1.3-1.3v-1.1H8.9v1.1c0 .7-.6 1.3-1.3 1.3h-.9c-.7 0-1.3-.6-1.3-1.3v-1.4c-.6-.3-1-.9-1-1.6V4.8Z" />
        <path
          d="M6.6 6.1c0-.5.4-.9.9-.9h8.9c.5 0 .9.4.9.9v3.6c0 .5-.4.9-.9.9H7.5a.9.9 0 0 1-.9-.9V6.1Z"
          fill={body}
        />
        <circle cx="8" cy="15.6" r="1.5" fill={body} />
        <circle cx="16" cy="15.6" r="1.5" fill={body} />
      </g>

      {label ? (
        <text
          y="34"
          textAnchor="middle"
          fontSize="12.5"
          fontWeight="700"
          fill={stale ? 'var(--text-subtle)' : 'var(--brand-600)'}
          style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3.5 }}
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}
