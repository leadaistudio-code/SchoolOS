import * as React from 'react'
import Link from 'next/link'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Icon } from '@/components/shell/icon'
import { Sparkline, type SeriesKey } from './charts'
import { cn } from '@/lib/utils'

const TONE: Record<SeriesKey, string> = {
  students: 'bg-[var(--chart-students)]/12 text-[var(--chart-students)]',
  staff: 'bg-[var(--chart-staff)]/12 text-[var(--chart-staff)]',
  parents: 'bg-[var(--chart-parents)]/12 text-[var(--chart-parents)]',
  attendance: 'bg-[var(--chart-attendance)]/12 text-[var(--chart-attendance)]',
  fees: 'bg-[var(--chart-fees)]/12 text-[var(--chart-fees)]',
  pending: 'bg-[var(--chart-pending)]/12 text-[var(--chart-pending)]',
  overdue: 'bg-[var(--chart-overdue)]/12 text-[var(--chart-overdue)]',
  admissions: 'bg-[var(--chart-admissions)]/12 text-[var(--chart-admissions)]',
  transport: 'bg-[var(--chart-transport)]/12 text-[var(--chart-transport)]',
  late: 'bg-[var(--chart-late)]/12 text-[var(--chart-late)]',
  leave: 'bg-[var(--chart-leave)]/12 text-[var(--chart-leave)]',
}

export type StatCardProps = {
  label: string
  value: string
  icon: string
  tone: SeriesKey
  href?: string
  /** Supporting line under the figure. Facts, not a description of the card. */
  sub?: React.ReactNode
  /**
   * Percentage change over the comparison period. Null means the history to
   * compute it does not exist — the card then shows no delta rather than a
   * plausible-looking invention.
   */
  changePercent?: number | null
  changeLabel?: string
  /** Down is not always bad: outstanding fees falling is good news. */
  goodWhenUp?: boolean
  series?: { label: string; value: number }[]
  delayMs?: number
}

/**
 * A headline figure with its context.
 *
 * The number is the only element at full contrast. The icon is tinted, not
 * filled, so four cards in a row read as one band of data rather than four
 * competing badges — and the sparkline sits behind the text at low weight
 * because direction is secondary to the value itself.
 */
export function StatCard({
  label,
  value,
  icon,
  tone,
  href,
  sub,
  changePercent,
  changeLabel = 'since last month',
  goodWhenUp = true,
  series,
  delayMs,
}: StatCardProps) {
  const up = (changePercent ?? 0) >= 0
  const good = goodWhenUp ? up : !up

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-muted">{label}</p>
          <p className="mt-1.5 text-3xl font-semibold tnum leading-none text-ink">{value}</p>
        </div>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-[12px]', TONE[tone])}>
          <Icon name={icon} className="size-5" />
        </span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {changePercent !== null && changePercent !== undefined ? (
            <p
              className={cn(
                'flex items-center gap-1 text-xs font-semibold tnum',
                good ? 'text-success' : 'text-[var(--danger)]',
              )}
            >
              {up ? (
                <TrendingUp className="size-3.5" aria-hidden />
              ) : (
                <TrendingDown className="size-3.5" aria-hidden />
              )}
              {up ? '+' : '−'}
              {Math.abs(changePercent)}%
              <span className="font-normal text-ink-subtle">{changeLabel}</span>
            </p>
          ) : null}
          {sub ? <p className="mt-0.5 truncate text-xs text-ink-subtle">{sub}</p> : null}
        </div>

        {series && series.length > 1 ? (
          <div className="w-24 shrink-0 sm:w-28">
            <Sparkline data={series} tone={tone} height={36} />
          </div>
        ) : null}
      </div>
    </>
  )

  const className = 'widget rise-in lift block p-4'
  const style = delayMs ? { animationDelay: `${delayMs}ms` } : undefined

  return href ? (
    <Link href={href} className={className} style={style}>
      {body}
    </Link>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  )
}
