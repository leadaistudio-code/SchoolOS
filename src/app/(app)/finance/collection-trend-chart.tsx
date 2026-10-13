'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Point = { label: string; collectedMinor: number; billedMinor: number }

const compact = (rupees: number) =>
  rupees >= 1_00_00_000
    ? `₹${(rupees / 1_00_00_000).toFixed(1)}Cr`
    : rupees >= 1_00_000
      ? `₹${(rupees / 1_00_000).toFixed(1)}L`
      : rupees >= 1000
        ? `₹${(rupees / 1000).toFixed(0)}k`
        : `₹${rupees}`

export function CollectionTrendChart({ data }: { data: Point[] }) {
  const rows = data.map((d) => ({ label: d.label, Collected: d.collectedMinor / 100, Billed: d.billedMinor / 100 }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--text-subtle)' }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => compact(v)}
        />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          formatter={(value: number, name: string) => [`₹${value.toLocaleString('en-IN')}`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Billed" fill="var(--border-strong, #cbd5e1)" radius={[4, 4, 0, 0]} isAnimationActive={false} barSize={18} />
        <Bar dataKey="Collected" fill="var(--brand-500)" radius={[4, 4, 0, 0]} isAnimationActive={false} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}
