import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Chart primitives for the marketing site.
 *
 * The application draws its charts with Recharts, which is the right choice
 * there: those charts have tooltips, range switches and live data. On the public
 * site the same charts are pictures — nobody hovers a fee donut on a landing
 * page — and importing them cost the homepage about 115 kB of gzipped
 * JavaScript for behaviour no visitor can use.
 *
 * These are pure SVG, rendered on the server, and ship no JavaScript at all.
 * They use the application's own `--chart-*` tokens, so a figure on the website
 * is the same colour as the figure a customer sees after signing in.
 *
 * They are deliberately *not* a general charting library. Four shapes, each
 * with the one axis treatment the site needs.
 */

export const CHART = {
  students: 'var(--chart-students)',
  staff: 'var(--chart-staff)',
  attendance: 'var(--chart-attendance)',
  fees: 'var(--chart-fees)',
  pending: 'var(--chart-pending)',
  overdue: 'var(--chart-overdue)',
  admissions: 'var(--chart-admissions)',
  transport: 'var(--chart-transport)',
  late: 'var(--chart-late)',
  leave: 'var(--chart-leave)',
} as const

export type ChartTone = keyof typeof CHART

/** An area sparkline. Direction, at low weight, behind a figure. */
export function MiniSparkline({
  data,
  tone,
  height = 36,
  className,
}: {
  data: number[]
  tone: ChartTone
  height?: number
  className?: string
}) {
  if (data.length < 2) return null

  const width = 110
  const min = Math.min(...data)
  const max = Math.max(...data)
  // A flat series would divide by zero; give it a mid-line instead.
  const span = max - min || 1
  const step = width / (data.length - 1)

  const points = data.map((value, index) => {
    const x = index * step
    const y = height - 2 - ((value - min) / span) * (height - 6)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('h-auto w-full', className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polygon
        points={`0,${height} ${points.join(' ')} ${width},${height}`}
        fill={CHART[tone]}
        opacity="0.12"
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={CHART[tone]}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** A donut with a figure in the middle. Used for fee collection. */
export function MiniDonut({
  slices,
  centreValue,
  centreLabel,
  size = 150,
}: {
  slices: { label: string; value: number; tone: ChartTone }[]
  centreValue: string
  centreLabel: string
  size?: number
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1
  const radius = size / 2 - 12
  const circumference = 2 * Math.PI * radius

  let offset = 0

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" aria-hidden>
        {slices.map((slice) => {
          const length = (slice.value / total) * circumference
          const dash = `${length} ${circumference - length}`
          const element = (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={CHART[slice.tone]}
              strokeWidth="14"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          )
          offset += length
          return element
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="tnum text-[15px] font-semibold leading-tight text-ink">{centreValue}</p>
          <p className="text-[11px] text-ink-subtle">{centreLabel}</p>
        </div>
      </div>
    </div>
  )
}

/** A part-circle gauge. Used for the attendance percentage. */
export function MiniRing({
  percent,
  label,
  sub,
  size = 132,
}: {
  percent: number
  label: string
  sub?: string
  size?: number
}) {
  const radius = size / 2 - 10
  const circumference = 2 * Math.PI * radius
  // Three-quarters of a turn, so the gap reads as a gauge rather than a
  // half-finished ring.
  const sweep = 0.75
  const filled = Math.max(0, Math.min(100, percent)) / 100

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full" aria-hidden>
        <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth="10"
            strokeDasharray={`${circumference * sweep} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={CHART.attendance}
            strokeWidth="10"
            strokeDasharray={`${circumference * sweep * filled} ${circumference}`}
            strokeLinecap="round"
          />
        </g>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="tnum text-[22px] font-semibold leading-none text-ink">{label}</p>
          {sub ? <p className="mt-1 text-[11px] text-ink-subtle">{sub}</p> : null}
        </div>
      </div>
    </div>
  )
}

/**
 * Grouped columns with a line over them. Used for head count against
 * attendance, which is the application's own academic overview.
 */
export function MiniColumns({
  data,
  height = 200,
}: {
  data: { label: string; bar: number; line: number }[]
  height?: number
}) {
  const width = 520
  const padBottom = 22
  const plot = height - padBottom
  const maxBar = Math.max(...data.map((d) => d.bar)) * 1.08
  const slot = width / data.length
  const barWidth = Math.min(34, slot * 0.42)

  const linePoints = data.map((point, index) => {
    const x = index * slot + slot / 2
    // The line is a percentage; scale it across the upper two-thirds so it
    // never collides with the columns.
    const y = plot - (point.line / 100) * plot * 0.92
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Head count and attendance for ${data.map((d) => d.label).join(', ')}`}
    >
      {/* Three gridlines. Enough to read a value against, few enough to ignore. */}
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          x1="0"
          x2={width}
          y1={plot - plot * fraction}
          y2={plot - plot * fraction}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      ))}
      <line x1="0" x2={width} y1={plot} y2={plot} stroke="var(--border)" strokeWidth="1" />

      {data.map((point, index) => {
        const barHeight = (point.bar / maxBar) * plot
        const x = index * slot + (slot - barWidth) / 2
        return (
          <g key={point.label}>
            <rect
              x={x}
              y={plot - barHeight}
              width={barWidth}
              height={barHeight}
              rx="4"
              fill={CHART.students}
              opacity="0.85"
            />
            <text
              x={index * slot + slot / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-subtle)"
            >
              {point.label}
            </text>
          </g>
        )
      })}

      <polyline
        points={linePoints.join(' ')}
        fill="none"
        stroke={CHART.attendance}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {linePoints.map((point) => {
        const [x, y] = point.split(',')
        return <circle key={point} cx={x} cy={y} r="3" fill="var(--surface)" stroke={CHART.attendance} strokeWidth="2" />
      })}
    </svg>
  )
}

/** A horizontal legend row for the donut and the columns. */
export function MiniLegend({
  items,
  className,
}: {
  items: { label: string; value?: string; tone: ChartTone }[]
  className?: string
}) {
  return (
    <ul className={cn('space-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-xs">
          <span
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: CHART[item.tone] }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-ink-muted">{item.label}</span>
          {item.value ? <span className="tnum shrink-0 text-ink">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  )
}
