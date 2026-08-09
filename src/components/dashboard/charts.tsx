'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '@/lib/utils'

const axisStyle = { fontSize: 11, fill: 'var(--text-subtle)', fontWeight: 500 }

/**
 * Attendance over the last week. A line/area is the right form here: the
 * question is "is attendance drifting?", which is a trend question.
 */
export function AttendanceTrendChart({
  data,
}: {
  data: { label: string; percent: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={data} margin={{ top: 5, right: 6, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} tick={axisStyle} tickLine={false} axisLine={false} width={44} unit="%" />
        <Tooltip
          cursor={{ stroke: 'var(--border)' }}
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--text)',
            boxShadow: 'var(--shadow-pop)',
          }}
          formatter={(v: number) => [`${v}%`, 'Present']}
        />
        <Area
          type="monotone"
          dataKey="percent"
          stroke="var(--brand-500)"
          strokeWidth={2}
          fill="url(#attFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Daily collection. Discrete daily totals compare better as bars. */
export function CollectionChart({
  data,
  currency,
}: {
  data: { label: string; amount: number }[]
  currency: string
}) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} margin={{ top: 5, right: 6, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={58}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip
          cursor={{ fill: 'color-mix(in srgb, var(--border) 45%, transparent)' }}
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--text)',
            boxShadow: 'var(--shadow-pop)',
          }}
          formatter={(v: number) => [formatMoney(v * 100, currency), 'Collected']}
        />
        <Bar dataKey="amount" fill="var(--accent-500)" radius={[6, 6, 0, 0]} maxBarSize={34} />
      </BarChart>
    </ResponsiveContainer>
  )
}
