'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * The school score over its recorded checkpoints.
 *
 * The Y axis deliberately does not start at zero. Every school worth running
 * scores somewhere above 50, and a zero-based axis would flatten a ten-point
 * slide — the movement is the entire point of this chart, so the axis is fitted
 * to the data and the range is stated on it rather than implied.
 */
export function ScoreTrendChart({
  points,
}: {
  points: { label: string; score: number }[]
}) {
  if (points.length < 2) {
    return (
      <p className="px-1 py-8 text-center text-sm text-ink-subtle">
        One checkpoint recorded. Record another to see which way the school is moving.
      </p>
    )
  }

  const values = points.map((p) => p.score)
  const min = Math.max(0, Math.floor(Math.min(...values) - 5))
  const max = Math.min(100, Math.ceil(Math.max(...values) + 5))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="score-trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[min, max]}
          tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--text-muted)' }}
          formatter={(value: number) => [value.toFixed(1), 'School score']}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="var(--brand-500)"
          strokeWidth={2}
          fill="url(#score-trend)"
          isAnimationActive={false}
          dot={{ r: 2.5, fill: 'var(--brand-500)', strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
