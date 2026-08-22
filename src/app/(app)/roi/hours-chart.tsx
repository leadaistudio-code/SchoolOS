'use client'

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/**
 * Where the saved hours come from.
 *
 * Horizontal because the labels are phrases, not dates — rotating "Question-paper
 * preparation" onto a vertical axis to save space costs more legibility than the
 * space is worth. Ordered largest first, so the biggest lever is at the top.
 */
export function HoursChart({ data }: { data: { label: string; hours: number }[] }) {
  const height = Math.max(160, data.length * 42)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
          tickLine={false}
          axisLine={false}
          unit=" hrs"
        />
        <YAxis
          type="category"
          dataKey="label"
          width={168}
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number) => [`${value} hrs/month`, 'Saved']}
        />
        <Bar dataKey="hours" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={18}>
          {data.map((entry) => (
            <Cell key={entry.label} fill="var(--brand-500)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
