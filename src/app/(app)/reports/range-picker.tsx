'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Presets duplicated from the server so a click resolves without a round trip. */
const PRESETS: { key: string; label: string; days: number }[] = [
  { key: '30d', label: '30 days', days: 29 },
  { key: '90d', label: '90 days', days: 89 },
  { key: '6m', label: '6 months', days: 181 },
  { key: '12m', label: '12 months', days: 364 },
]

function isoDay(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  return d.toISOString().slice(0, 10)
}

/**
 * The date window every range-scoped report reads.
 *
 * The range lives in the URL rather than in component state, so a report a
 * bursar wants a second opinion on is a link they can paste — and the export
 * endpoint gets the same window from the same place.
 */
export function RangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const push = React.useCallback(
    (nextFrom: string, nextTo: string) => {
      const next = new URLSearchParams(params.toString())
      next.set('from', nextFrom)
      next.set('to', nextTo)
      router.push(`${pathname}?${next.toString()}`)
    },
    [params, pathname, router],
  )

  const today = isoDay(0)
  const activePreset = PRESETS.find((p) => p.days === daysBetween(from, to) && to === today)

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={from}
          max={to}
          aria-label="From date"
          className="w-[9.5rem]"
          onChange={(e) => e.target.value && push(e.target.value, to)}
        />
        <span className="text-sm text-ink-subtle">to</span>
        <Input
          type="date"
          value={to}
          min={from}
          aria-label="To date"
          className="w-[9.5rem]"
          onChange={(e) => e.target.value && push(from, e.target.value)}
        />
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="Range presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => push(isoDay(preset.days), today)}
            aria-pressed={activePreset?.key === preset.key}
            className={cn(
              'rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs font-medium transition-colors',
              activePreset?.key === preset.key
                ? 'border-[var(--product-500)] bg-[var(--product-50)] text-[var(--product-600)]'
                : 'border-line text-ink-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </>
  )
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return -1
  return Math.round((b - a) / 86_400_000)
}
