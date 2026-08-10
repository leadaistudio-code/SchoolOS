import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type Trend = { value: number; label: string; goodWhenUp?: boolean }

/**
 * A figure with its context.
 *
 * Metrics sit in a shared bordered strip rather than in a card each: four
 * boxes with four icons and four accent colours is decoration, not
 * information. The figure is the only element at full contrast; the label
 * above and the supporting line below stay quiet.
 */
export function Metric({
  label,
  value,
  sub,
  href,
  trend,
  emphasis,
  className,
}: {
  label: string
  value: string
  /** Breakdown that makes the figure actionable — "2,274 present · 208 absent". */
  sub?: React.ReactNode
  href?: string
  trend?: Trend
  /** Colours the figure. Reserved for a value that demands a response. */
  emphasis?: 'danger' | 'warning' | 'success'
  className?: string
}) {
  const up = (trend?.value ?? 0) >= 0
  const good = trend ? (trend.goodWhenUp === false ? !up : up) : true

  const body = (
    <>
      <p className="text-xs font-medium text-ink-muted group-hover:text-ink">{label}</p>
      <p
        className={cn(
          'text-3xl font-semibold tnum mt-1.5',
          emphasis === 'danger' && 'text-[var(--danger)]',
          emphasis === 'warning' && 'text-warning',
          emphasis === 'success' && 'text-success',
          !emphasis && 'text-ink',
        )}
      >
        {value}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-ink-subtle">
        {trend ? (
          <span className={cn('font-medium tnum', good ? 'text-success' : 'text-[var(--danger)]')}>
            {up ? '+' : '−'}
            {Math.abs(trend.value)}% {trend.label}
          </span>
        ) : null}
        {sub ? <span className="min-w-0">{sub}</span> : null}
      </div>
    </>
  )

  return (
    <div className={cn('bg-surface px-4 py-3 min-w-0', className)}>
      {href ? (
        <Link href={href} className="block group">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  )
}

/**
 * The row that holds the page's metrics. One border, internal dividers — so a
 * dashboard opens with a single band of numbers instead of a grid of boxes.
 */
export function MetricRow({
  className,
  columns = 4,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { columns?: 2 | 3 | 4 }) {
  // gap-px over a line-coloured ground draws the dividers, so the rule stays
  // correct however the cells wrap.
  return (
    <div
      className={cn(
        'grid gap-px bg-line border border-line rounded-[var(--radius)] overflow-hidden',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-3',
        columns === 4 && 'grid-cols-2 xl:grid-cols-4',
        className,
      )}
      {...props}
    />
  )
}
