'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Point = { label: string; directMinor: number; indirectMinor: number; incomeMinor?: number }

const compact = (rupees: number) =>
  rupees >= 1_00_00_000
    ? `₹${(rupees / 1_00_00_000).toFixed(1)}Cr`
    : rupees >= 1_00_000
      ? `₹${(rupees / 1_00_000).toFixed(1)}L`
      : rupees >= 1000
        ? `₹${(rupees / 1000).toFixed(0)}k`
        : `₹${rupees}`

/** Month-wise direct vs indirect spend, optionally against fee income. */
export function ExpenseChart({ data, height = 240 }: { data: Point[]; height?: number }) {
  const withIncome = data.some((d) => d.incomeMinor !== undefined)
  const rows = data.map((d) => ({
    label: d.label,
    Direct: d.directMinor / 100,
    Indirect: d.indirectMinor / 100,
    ...(withIncome ? { 'Fees collected': (d.incomeMinor ?? 0) / 100 } : {}),
  }))
  return (
    <ResponsiveContainer width="100%" height={height}>
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
        {withIncome ? (
          <Bar dataKey="Fees collected" fill="var(--success, #16a34a)" radius={[4, 4, 0, 0]} isAnimationActive={false} barSize={14} />
        ) : null}
        <Bar dataKey="Direct" stackId="exp" fill="var(--brand-500)" isAnimationActive={false} barSize={withIncome ? 14 : 20} />
        <Bar dataKey="Indirect" stackId="exp" fill="var(--warning, #f59e0b)" radius={[4, 4, 0, 0]} isAnimationActive={false} barSize={withIncome ? 14 : 20} />
      </BarChart>
    </ResponsiveContainer>
  )
}
