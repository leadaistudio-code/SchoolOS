import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A horizontal progress / proportion bar.
 *
 * Used for a completion rate or a readiness percentage — a value the eye should
 * be able to compare across rows at a glance, which a bare number does not
 * afford. The track is a quiet surface; only the fill carries colour, and the
 * tone is reserved for values that ask for a response (a low readiness figure),
 * never applied by default.
 */
export function Progress({
  value,
  tone = 'brand',
  className,
  label,
}: {
  /** 0–100. Clamped, so a caller passing 103 or −4 cannot break the layout. */
  value: number
  tone?: 'brand' | 'success' | 'warning' | 'danger'
  className?: string
  /** Accessible name, e.g. "Science department readiness". */
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const fill = {
    brand: 'bg-[var(--brand-500)]',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-[var(--danger)]',
  }[tone]

  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-[width]', fill)} style={{ width: `${pct}%` }} />
    </div>
  )
}
