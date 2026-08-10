'use client'

import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney, formatNumber } from '@/lib/utils'

/**
 * Chart primitives.
 *
 * One axis style, one tooltip, one series palette. The palette is read from
 * CSS custom properties rather than written here, so a series keeps its
 * meaning across light and dark and no chart has to know which theme is on.
 */

const axisStyle = { fontSize: 11, fill: 'var(--text-subtle)' }

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--text)',
  boxShadow: 'var(--shadow-pop)',
  padding: '8px 10px',
}

export const SERIES = {
  students: 'var(--chart-students)',
  staff: 'var(--chart-staff)',
  parents: 'var(--chart-parents)',
  attendance: 'var(--chart-attendance)',
  fees: 'var(--chart-fees)',
  pending: 'var(--chart-pending)',
  overdue: 'var(--chart-overdue)',
  admissions: 'var(--chart-admissions)',
  transport: 'var(--chart-transport)',
  late: 'var(--chart-late)',
  leave: 'var(--chart-leave)',
} as const

export type SeriesKey = keyof typeof SERIES

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

/**
 * The line behind a KPI figure.
 *
 * No axes, no grid, no tooltip: it answers "which way has this been going",
 * and any more furniture than a line would make a decorative element compete
 * with the number it belongs to.
 */
export function Sparkline({
  data,
  tone,
  height = 40,
}: {
  data: { label: string; value: number }[]
  tone: SeriesKey
  height?: number
}) {
  const id = React.useId()
  if (data.length < 2) return <div style={{ height }} aria-hidden />

  return (
    <div aria-hidden>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[tone]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SERIES[tone]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={SERIES[tone]}
            strokeWidth={2}
            fill={`url(#spark-${id})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Academic overview
// ---------------------------------------------------------------------------

export type AcademicPoint = {
  label: string
  students: number
  staff: number
  attendance: number | null
}

/**
 * Head count against attendance.
 *
 * Two quantities and a rate share one frame, so the rate gets its own axis on
 * the right. Bars for the counts because they are discrete monthly readings; a
 * line for attendance because the question there is direction, not magnitude.
 */
export function AcademicOverviewChart({ data }: { data: AcademicPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis yAxisId="count" tick={axisStyle} tickLine={false} axisLine={false} width={46} />
        <YAxis
          yAxisId="rate"
          orientation="right"
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={38}
          unit="%"
        />
        <Tooltip
          cursor={{ fill: 'color-mix(in srgb, var(--border) 35%, transparent)' }}
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) =>
            name === 'Attendance'
              ? [`${value}%`, name]
              : [formatNumber(value), name]
          }
        />
        <Bar
          yAxisId="count"
          dataKey="students"
          name="Students"
          fill={SERIES.students}
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
        />
        <Bar
          yAxisId="count"
          dataKey="staff"
          name="Staff"
          fill={SERIES.staff}
          radius={[4, 4, 0, 0]}
          maxBarSize={22}
        />
        <Line
          yAxisId="rate"
          type="monotone"
          dataKey="attendance"
          name="Attendance"
          stroke={SERIES.attendance}
          strokeWidth={2.5}
          dot={{ r: 3, fill: SERIES.attendance, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Donuts
// ---------------------------------------------------------------------------

export type DonutSlice = { key: string; label: string; value: number; color: string }

/**
 * A donut with its total in the middle.
 *
 * Used only where the slices are parts of one whole that a reader will want
 * summed — billed fees, a day's register. Anything else is a bar chart.
 */
export function DonutChart({
  slices,
  centerValue,
  centerLabel,
  height = 200,
  currency,
}: {
  slices: DonutSlice[]
  centerValue: string
  centerLabel: string
  height?: number
  /**
   * Formats tooltip values as money. A currency code rather than a formatter
   * function: props crossing from a server component into this one are
   * serialised, and a function cannot cross that boundary.
   */
  currency?: string
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={total > 0 ? slices : [{ key: 'empty', label: 'No data', value: 1, color: 'var(--border)' }]}
            dataKey="value"
            nameKey="label"
            innerRadius="66%"
            outerRadius="94%"
            paddingAngle={total > 0 ? 2 : 0}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {(total > 0 ? slices : [{ key: 'empty', color: 'var(--border)' }]).map((slice) => (
              <Cell key={slice.key} fill={slice.color} />
            ))}
          </Pie>
          {total > 0 ? (
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => [
                currency ? formatMoney(value, currency) : formatNumber(value),
                name,
              ]}
            />
          ) : null}
        </PieChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-xl font-semibold tnum text-ink">{centerValue}</p>
          <p className="text-xs text-ink-subtle">{centerLabel}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Attendance as a single filled ring.
 *
 * A radial gauge rather than a donut because there is one figure here, not a
 * set of parts: the ring is how full the school was today.
 */
export function AttendanceRadial({
  percent,
  height = 200,
}: {
  percent: number
  height?: number
}) {
  const data = [{ name: 'Present', value: Math.max(0, Math.min(100, percent)) }]

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart
          data={data}
          innerRadius="68%"
          outerRadius="100%"
          startAngle={220}
          endAngle={-40}
        >
          <defs>
            <linearGradient id="attendance-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={SERIES.attendance} />
              <stop offset="100%" stopColor={SERIES.transport} />
            </linearGradient>
          </defs>
          {/* The scale lives on the angle axis, not the bar: without this the
              ring would size itself to the single value it was given and always
              render full. */}
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={12}
            fill="url(#attendance-ring)"
            background={{ fill: 'var(--surface-3)' }}
          />
        </RadialBarChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-2xl font-semibold tnum text-ink">{percent}%</p>
          <p className="text-xs text-ink-subtle">Overall</p>
        </div>
      </div>
    </div>
  )
}
