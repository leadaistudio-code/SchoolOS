import * as React from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Icon } from '@/components/shell/icon'
import { cn } from '@/lib/utils'

export type Trend = { value: number; label: string; goodWhenUp?: boolean }

export type StatTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'indigo' | 'purple' | 'teal'

const TONE_CHIP: Record<StatTone, string> = {
  brand: 'bg-[var(--brand-50)] text-[var(--brand-500)]',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-[var(--danger)]',
  info: 'bg-info-bg text-info',
  indigo: 'bg-indigo-bg text-indigo',
  purple: 'bg-purple-bg text-purple',
  teal: 'bg-teal-bg text-teal',
}

const TONE_BAR: Record<StatTone, string> = {
  brand: 'bg-[var(--brand-500)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  danger: 'bg-[var(--danger)]',
  info: 'bg-[var(--info)]',
  indigo: 'bg-[var(--indigo)]',
  purple: 'bg-[var(--purple)]',
  teal: 'bg-[var(--teal)]',
}

/**
 * Dashboard metric tile.
 *
 * Layout follows the reference: a soft-tinted icon chip on the left, the
 * figure as the hero, a trend pill beneath, and a thin accent rule down the
 * leading edge to colour-code the metric without shouting. The number is the
 * only thing at full contrast — everything else is deliberately quieter.
 */
export function StatCard({
  label,
  value,
  sub,
  icon,
  href,
  trend,
  tone = 'brand',
  gradient = false,
}: {
  label: string
  value: string
  sub?: string
  icon: string
  href?: string
  trend?: Trend
  tone?: StatTone
  /** Filled treatment, used sparingly for the single headline metric. */
  gradient?: boolean
}) {
  const up = (trend?.value ?? 0) >= 0
  const good = trend ? (trend.goodWhenUp === false ? !up : up) : true

  const body = gradient ? (
    <div
      className="relative overflow-hidden rounded-[var(--radius)] p-4 h-full text-white shadow-[var(--shadow-card)]"
      style={{ background: 'var(--grad-brand)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-white/85">{label}</p>
        <span className="size-9 rounded-[var(--radius-sm)] grid place-items-center bg-white/20 shrink-0">
          <Icon name={icon} className="size-4.5" />
        </span>
      </div>
      <p className="text-[26px] font-bold mt-2.5 tnum leading-none">{value}</p>
      <div className="flex items-center gap-2 mt-2.5 min-h-5">
        {trend ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[11.5px] font-semibold">
            {up ? (
              <ArrowUpRight className="size-3" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3" aria-hidden />
            )}
            {Math.abs(trend.value)}%
          </span>
        ) : null}
        {sub ?? trend?.label ? (
          <span className="text-[11.5px] text-white/80 truncate">{sub ?? trend?.label}</span>
        ) : null}
      </div>
    </div>
  ) : (
    <div className="relative overflow-hidden bg-surface border border-line rounded-[var(--radius)] p-4 h-full shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      {/* Leading accent rule: colour-codes the metric at a glance. */}
      <span className={cn('absolute inset-y-0 left-0 w-1', TONE_BAR[tone])} aria-hidden />

      <div className="flex items-start justify-between gap-3 pl-1.5">
        <p className="text-[12.5px] font-medium text-ink-muted">{label}</p>
        <span
          className={cn(
            'size-9 rounded-[var(--radius-sm)] grid place-items-center shrink-0',
            TONE_CHIP[tone],
          )}
        >
          <Icon name={icon} className="size-4.5" />
        </span>
      </div>

      <p className="text-[26px] font-bold text-ink mt-2.5 tnum leading-none pl-1.5">{value}</p>

      <div className="flex items-center gap-2 mt-2.5 min-h-5 pl-1.5">
        {trend ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-semibold',
              good ? 'bg-success-bg text-success' : 'bg-danger-bg text-[var(--danger)]',
            )}
          >
            {up ? (
              <ArrowUpRight className="size-3" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3" aria-hidden />
            )}
            {Math.abs(trend.value)}%
          </span>
        ) : null}
        {sub ?? trend?.label ? (
          <span className="text-[11.5px] text-ink-subtle truncate">{sub ?? trend?.label}</span>
        ) : null}
      </div>
    </div>
  )

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}
