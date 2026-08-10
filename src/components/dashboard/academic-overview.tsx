'use client'

import * as React from 'react'
import { AcademicOverviewChart, SERIES, type AcademicPoint } from './charts'
import { cn } from '@/lib/utils'

const RANGES = [
  { key: '3', label: 'Last 3 months', months: 3 },
  { key: '6', label: 'Last 6 months', months: 6 },
  { key: '12', label: 'Last 12 months', months: 12 },
] as const

/**
 * Head count and attendance on one frame.
 *
 * The range control slices data the page already holds rather than refetching:
 * twelve months arrive with the dashboard, so switching to three is instant
 * and costs no round trip. The filter can only narrow what actually exists —
 * there is no option here that would need data we have not got.
 */
export function AcademicOverview({ data }: { data: AcademicPoint[] }) {
  const [range, setRange] = React.useState<(typeof RANGES)[number]['key']>('6')

  const months = RANGES.find((r) => r.key === range)?.months ?? 6
  const visible = data.slice(Math.max(0, data.length - months))

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LegendItem color={SERIES.students}>Students</LegendItem>
          <LegendItem color={SERIES.staff}>Staff</LegendItem>
          <LegendItem color={SERIES.attendance} line>
            Attendance %
          </LegendItem>
        </ul>

        <div className="flex rounded-[var(--radius-sm)] border border-line p-0.5" role="group" aria-label="Date range">
          {RANGES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRange(option.key)}
              aria-pressed={range === option.key}
              className={cn(
                'rounded-[6px] px-2.5 py-1 text-xs font-medium transition-colors',
                range === option.key
                  ? 'bg-[var(--product-500)] text-white'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              {option.months}m
            </button>
          ))}
        </div>
      </div>

      <AcademicOverviewChart data={visible} />
    </div>
  )
}

function LegendItem({
  color,
  line,
  children,
}: {
  color: string
  line?: boolean
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-1.5 text-xs text-ink-muted">
      <span
        className={cn('shrink-0 rounded-full', line ? 'h-0.5 w-4' : 'size-2.5')}
        style={{ background: color }}
        aria-hidden
      />
      {children}
    </li>
  )
}
