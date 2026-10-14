'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/utils'
import { sliceColor } from '@/server/modules/accounting/analytics'
import { callApi } from './payables-forms'

/*
 * Analytics charts. Every bar, slice and point opens the audit pane for the
 * figure it draws; the page also lists each figure as a link, so nothing here
 * is the only way in.
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
const IN = 'var(--chart-fees)'
const OUT = 'var(--chart-overdue)'
const NET = 'var(--chart-staff)'

function compact(minor: number, currency: string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100)
}

function useGo() {
  const router = useRouter()
  return (href?: string) => {
    if (href) router.push(href)
  }
}

export type CashGroupPoint = { key: string; label: string; inflowMinor: number; outflowMinor: number; href: string }

export function CashFlowBySourceChart({ data, currency }: { data: CashGroupPoint[]; currency: string }) {
  const go = useGo()
  const shown = data.filter((d) => d.inflowMinor || d.outflowMinor)
  const height = Math.max(160, shown.length * 46 + 40)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={shown} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v: number) => compact(v, currency)} />
        <YAxis type="category" dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} width={150} />
        <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--border) 35%, transparent)' }} contentStyle={tooltipStyle} formatter={(v: number, name: string) => [formatMoney(v, currency), name]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="inflowMinor" name="Money in" fill={IN} radius={[0, 4, 4, 0]} maxBarSize={16} cursor="pointer" onClick={(d: { payload?: CashGroupPoint }) => go(d.payload?.href)} />
        <Bar dataKey="outflowMinor" name="Money out" fill={OUT} radius={[0, 4, 4, 0]} maxBarSize={16} cursor="pointer" onClick={(d: { payload?: CashGroupPoint }) => go(d.payload?.href)} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export type CashMonthPoint = { label: string; inflowMinor: number; outflowMinor: number; netMinor: number; href: string }

export function CashFlowByMonthChart({ data, currency }: { data: CashMonthPoint[]; currency: string }) {
  const go = useGo()
  const open = (d: { payload?: CashMonthPoint; activePayload?: { payload: CashMonthPoint }[] }) => go(d.payload?.href ?? d.activePayload?.[0]?.payload.href)
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} onClick={open} style={{ cursor: 'pointer' }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => compact(v, currency)} />
        <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--border) 35%, transparent)' }} contentStyle={tooltipStyle} formatter={(v: number, name: string) => [formatMoney(v, currency), name]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="inflowMinor" name="Money in" fill={IN} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="outflowMinor" name="Money out" fill={OUT} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Line dataKey="netMinor" name="Net" stroke={NET} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: NET }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export type SlicePoint = { key: string; label: string; valueMinor: number; href: string }

export function ExpenseDonut({ data, currency, centerValue }: { data: SlicePoint[]; currency: string; centerValue: string }) {
  const go = useGo()
  const slices = data.filter((d) => d.valueMinor > 0)
  return (
    <div className="relative" style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={slices.length ? slices : [{ key: 'none', label: 'Nothing posted', valueMinor: 1, href: '' }]}
            dataKey="valueMinor"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={slices.length > 1 ? 2 : 0}
            stroke="var(--surface)"
            strokeWidth={2}
            cursor={slices.length ? 'pointer' : undefined}
            onClick={(d: { payload?: SlicePoint }) => go(d.payload?.href)}
          >
            {(slices.length ? slices : [{ key: 'none' }]).map((s, i) => (
              <Cell key={s.key} fill={slices.length ? sliceColor(i) : 'var(--border)'} />
            ))}
          </Pie>
          {slices.length ? <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [formatMoney(v, currency), name]} /> : null}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-lg font-semibold tnum text-ink">{centerValue}</p>
          <p className="text-xs text-ink-subtle">total expenses</p>
        </div>
      </div>
    </div>
  )
}

export function AgingChart({ data, currency }: { data: (SlicePoint & { overdue: boolean })[]; currency: string }) {
  const go = useGo()
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => compact(v, currency)} />
        <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--border) 35%, transparent)' }} contentStyle={tooltipStyle} formatter={(v: number) => [formatMoney(v, currency), 'Outstanding']} />
        <Bar dataKey="valueMinor" name="Outstanding" radius={[4, 4, 0, 0]} maxBarSize={48} cursor="pointer" onClick={(d: { payload?: SlicePoint }) => go(d.payload?.href)}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.overdue ? OUT : 'var(--chart-pending)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export type WdvPoint = { label: string; wdvMinor: number; costMinor: number; href: string }

export function WdvTrendChart({ data, currency }: { data: WdvPoint[]; currency: string }) {
  const go = useGo()
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
        onClick={(d: { activePayload?: { payload: WdvPoint }[] }) => go(d.activePayload?.[0]?.payload.href)}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => compact(v, currency)} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [formatMoney(v, currency), name]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="costMinor" name="Cost of assets held" stroke="var(--chart-pending)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
        <Line dataKey="wdvMinor" name="Written-down value" stroke="var(--chart-students)" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: 'var(--chart-students)' }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Rebuilds the summary from the journal (accounts.manage). */
export function RebuildSummaryButton() {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        disabled={busy}
        title="Recompute every monthly total from the journal. Normally only months with new entries are recomputed."
        onClick={async () => {
          if (busy) return
          setBusy(true)
          setError(null)
          const res = await callApi('/api/v1/accounting/analytics/refresh', { method: 'POST' })
          setBusy(false)
          if (!res.ok) setError(res.message)
          else router.refresh()
        }}
      >
        Rebuild from journal
      </Button>
      {error ? <span className="text-xs text-[var(--danger)]">{error}</span> : null}
    </span>
  )
}
