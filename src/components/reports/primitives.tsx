import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Report visuals.
 *
 * Bars, not pies. Every distribution in this module answers "which is bigger,
 * and by how much", and a bar answers it at a glance where a wedge asks the
 * reader to compare angles. Each figure is printed next to its bar as well,
 * because a report is read as often on paper as on screen and a printed bar
 * with no number on it is decoration.
 *
 * All of these are server components: they take numbers and emit markup, with
 * no interaction to hydrate.
 */

/** Distribution as a labelled bar list — the workhorse of this module. */
export function BarList({
  rows,
  valueLabel,
  emptyLabel = 'Nothing recorded in this range',
  tone = 'product',
  className,
}: {
  rows: { label: string; value: number; display: string; note?: string }[]
  valueLabel?: string
  emptyLabel?: string
  tone?: 'product' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}) {
  const rendered = rows.filter((r) => Number.isFinite(r.value))
  if (rendered.length === 0) {
    return <p className={cn('px-4 py-6 text-sm text-ink-subtle', className)}>{emptyLabel}</p>
  }

  // Scaled against the largest row, not against the total: the question is
  // relative size, and against a total every bar in a long tail is a sliver.
  const peak = Math.max(...rendered.map((r) => Math.abs(r.value)), 1)

  return (
    <div className={cn('divide-y divide-[var(--border)]', className)}>
      {valueLabel ? (
        <p className="px-4 py-1.5 caption text-ink-subtle">{valueLabel}</p>
      ) : null}
      {rendered.map((row) => (
        <div key={row.label} className="px-4 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-ink">{row.label}</span>
            <span className="shrink-0 text-sm font-medium tnum text-ink">{row.display}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, (Math.abs(row.value) / peak) * 100)}%`,
                  backgroundColor: BAR_TONE[tone],
                }}
              />
            </div>
            {row.note ? (
              <span className="shrink-0 text-xs tnum text-ink-subtle">{row.note}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

const BAR_TONE: Record<string, string> = {
  product: 'var(--product-500)',
  success: 'var(--chart-attendance)',
  warning: 'var(--chart-pending)',
  danger: 'var(--chart-overdue)',
  info: 'var(--chart-fees)',
}

/**
 * A period-by-period column chart with up to two series.
 *
 * Columns rather than a line: these series are counted per month, and a line
 * implies a value existed between the points.
 */
export function ColumnChart({
  points,
  series,
  formatValue,
  height = 132,
  className,
}: {
  points: { label: string; values: number[] }[]
  series: { label: string; color: string }[]
  formatValue: (value: number) => string
  height?: number
  className?: string
}) {
  if (points.length === 0) {
    return <p className={cn('px-4 py-6 text-sm text-ink-subtle', className)}>Nothing to chart yet</p>
  }

  const peak = Math.max(...points.flatMap((p) => p.values), 1)

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            {s.label}
          </span>
        ))}
        <span className="ml-auto text-xs tnum text-ink-subtle">Peak {formatValue(peak)}</span>
      </div>

      <div className="scroll-thin overflow-x-auto px-4 pb-3">
        <div
          className="flex min-w-max items-end gap-3"
          style={{ height }}
          role="img"
          aria-label={`${series.map((s) => s.label).join(' and ')} by period`}
        >
          {points.map((point) => (
            <div key={point.label} className="flex h-full w-11 flex-col justify-end">
              <div className="flex h-full items-end justify-center gap-0.5">
                {point.values.map((value, i) => (
                  <div
                    key={series[i]?.label ?? i}
                    className="w-3.5 rounded-t-[3px]"
                    style={{
                      height: `${Math.max(value > 0 ? 3 : 1, (value / peak) * 100)}%`,
                      backgroundColor: series[i]?.color ?? 'var(--product-500)',
                    }}
                    title={`${series[i]?.label ?? ''} ${point.label}: ${formatValue(value)}`}
                  />
                ))}
              </div>
              <span className="mt-1.5 block truncate text-center text-[11px] text-ink-subtle">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * A funnel drawn as stacked proportional rows.
 *
 * Kept as rows rather than a tapering shape so a stage that gains enquiries
 * from a re-open does not have to be drawn wider than the stage above it.
 */
export function FunnelBars({
  stages,
  className,
}: {
  stages: { stage: string; label: string; count: number; share: number | null; terminal?: boolean }[]
  className?: string
}) {
  const peak = Math.max(...stages.map((s) => s.count), 1)

  return (
    <div className={cn('divide-y divide-[var(--border)]', className)}>
      {stages.map((s) => (
        <div key={s.stage} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-40 shrink-0 truncate text-sm text-ink">{s.label}</span>
          <div className="h-5 min-w-0 flex-1 overflow-hidden rounded-[4px] bg-surface-3">
            <div
              className="h-full rounded-[4px]"
              style={{
                width: `${Math.max(1, (s.count / peak) * 100)}%`,
                backgroundColor: s.terminal ? 'var(--chart-overdue)' : 'var(--product-500)',
                opacity: s.terminal ? 0.85 : 1,
              }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-sm font-medium tnum text-ink">
            {s.count}
          </span>
          <span className="w-12 shrink-0 text-right text-xs tnum text-ink-subtle">
            {s.share === null ? '—' : `${s.share}%`}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * A percentage cell that colours itself only when the number needs a reply.
 *
 * The thresholds are passed in because 75% means "at risk" for attendance and
 * "healthy" for fee realisation.
 */
export function PercentCell({
  value,
  warnBelow,
  dangerBelow,
  suffix = '%',
}: {
  value: number | null
  warnBelow?: number
  dangerBelow?: number
  suffix?: string
}) {
  if (value === null) return <span className="text-sm text-ink-subtle">—</span>

  const tone =
    dangerBelow !== undefined && value < dangerBelow
      ? 'text-[var(--danger)]'
      : warnBelow !== undefined && value < warnBelow
        ? 'text-warning'
        : 'text-ink'

  return (
    <span className={cn('text-sm font-medium tnum', tone)}>
      {value}
      {suffix}
    </span>
  )
}

/** A short line of prose under a panel title, for a caveat the numbers need. */
export function Footnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-line px-4 py-2 text-xs text-ink-subtle">{children}</p>
  )
}
