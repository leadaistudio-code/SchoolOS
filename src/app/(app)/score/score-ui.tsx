import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  BANDS,
  LOW_COVERAGE,
  bandMeta,
  type ComposedScore,
  type ScoreBand,
} from '@/lib/score'

/**
 * The shared vocabulary of the health card.
 *
 * Server components with no state: every screen in this section shows the same
 * number in the same shape, so a class score and a child's score are read the
 * same way and nobody has to relearn the page they are on.
 */

const BAND_COLOUR: Record<ScoreBand, string> = {
  EXCELLENT: 'var(--success)',
  GOOD: 'var(--brand-500)',
  FAIR: 'var(--warning)',
  AT_RISK: 'var(--danger)',
}

/**
 * The headline number.
 *
 * An arc rather than a bar, and only at the top of a page: the ring is what
 * makes the figure read as a verdict on the whole school rather than as one
 * more statistic in a row of them.
 */
export function ScoreDial({
  score,
  band,
  size = 148,
  caption,
}: {
  score: number | null
  band: ScoreBand | null
  size?: number
  caption?: string
}) {
  const stroke = Math.round(size * 0.085)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = score === null ? 0 : (score / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={stroke}
          />
          {score !== null && band ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={BAND_COLOUR[band]}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference - filled}`}
              // Start the arc at twelve o'clock rather than three, which is
              // where a reader expects a gauge to begin.
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ) : null}
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p
              className="font-semibold tnum leading-none text-ink"
              style={{ fontSize: Math.round(size * 0.26) }}
            >
              {score === null ? '—' : score.toFixed(0)}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              {score === null ? 'no data' : 'out of 100'}
            </p>
          </div>
        </div>
      </div>

      {band ? <Badge tone={bandMeta(band).tone}>{bandMeta(band).label}</Badge> : null}
      {caption ? <p className="text-xs text-ink-subtle">{caption}</p> : null}
    </div>
  )
}

/** Compact score plus band, for a table cell. */
export function ScorePill({ score, band }: { score: number | null; band: ScoreBand | null }) {
  if (score === null || !band) {
    return <span className="text-ink-subtle">Not scored</span>
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-semibold tnum text-ink">{score.toFixed(1)}</span>
      <Badge tone={bandMeta(band).tone}>{bandMeta(band).label}</Badge>
    </span>
  )
}

/**
 * How a population splits across the bands.
 *
 * A single stacked bar rather than four figures: the question it answers is
 * "how much of the school is in trouble", which is a proportion, and a
 * proportion is read faster as a length than as a number.
 */
export function BandBar({
  counts,
  total,
}: {
  counts: Record<ScoreBand, number>
  total: number
}) {
  const scored = BANDS.reduce((sum, b) => sum + counts[b.band], 0)
  if (scored === 0) {
    return <p className="text-sm text-ink-subtle">Nobody could be scored yet.</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
        {BANDS.map((b) =>
          counts[b.band] > 0 ? (
            <span
              key={b.band}
              style={{
                width: `${(counts[b.band] / scored) * 100}%`,
                background: BAND_COLOUR[b.band],
              }}
              title={`${b.label}: ${counts[b.band]}`}
            />
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {BANDS.map((b) => (
          <span key={b.band} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span
              className="size-2 rounded-full"
              style={{ background: BAND_COLOUR[b.band] }}
              aria-hidden
            />
            {b.label}
            <span className="tnum font-medium text-ink">{counts[b.band]}</span>
          </span>
        ))}
        {total > scored ? (
          <span className="text-xs text-ink-subtle">{total - scored} not scored</span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * States how much of the score is actually backed by data.
 *
 * Shown whenever coverage is short, never hidden behind a tooltip: a number
 * built on a third of its weight is a different claim from one built on all of
 * it, and the reader has to be told without having to go looking.
 */
export function CoverageNote({ coverage }: { coverage: number }) {
  const percent = Math.round(coverage * 100)
  if (coverage >= 0.999) return null

  const thin = coverage < LOW_COVERAGE
  return (
    <p className={cn('text-xs', thin ? 'text-warning' : 'text-ink-subtle')}>
      {thin ? 'Provisional — ' : ''}
      built on {percent}% of the weighting; the rest had nothing recorded yet and was shared out
      across what did.
    </p>
  )
}

/**
 * The score, taken apart.
 *
 * Every row states its own evidence, because the point of the number is that a
 * principal can disagree with it and immediately see why it says what it says.
 */
export function MetricBreakdown({ composed }: { composed: ComposedScore }) {
  if (composed.parts.length === 0) {
    return <p className="text-sm text-ink-subtle">No metric carries any weight.</p>
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {composed.parts.map((part) => (
        <li key={part.metric} className="py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink">{part.label}</span>
            <span className="shrink-0 text-sm tnum text-ink">
              {part.score === null ? (
                <span className="text-ink-subtle">not measured</span>
              ) : (
                `${part.score.toFixed(0)} / 100`
              )}
            </span>
          </div>

          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
            {part.score === null ? null : (
              <span
                style={{
                  width: `${part.score}%`,
                  background: BAND_COLOUR[
                    part.score >= 85 ? 'EXCELLENT' : part.score >= 70 ? 'GOOD' : part.score >= 55 ? 'FAIR' : 'AT_RISK'
                  ],
                }}
              />
            )}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
            <span>{part.detail}</span>
            <span aria-hidden>·</span>
            <span className="tnum">
              {(part.configuredShare * 100).toFixed(0)}% of the weighting
              {part.score !== null && Math.abs(part.effectiveShare - part.configuredShare) > 0.005
                ? `, counted at ${(part.effectiveShare * 100).toFixed(0)}%`
                : ''}
            </span>
          </p>
        </li>
      ))}
    </ul>
  )
}

/**
 * Group-level metric averages, strongest first.
 *
 * Ordered by score rather than by weight here, because the question at this
 * level is "what is this school good and bad at", and that is answered by
 * putting the extremes at the two ends of one list.
 */
export function MetricAverages({
  rows,
}: {
  rows: { metric: string; label: string; score: number | null; counted: number }[]
}) {
  const measured = rows.filter((r) => r.score !== null).sort((a, b) => b.score! - a.score!)
  const dark = rows.filter((r) => r.score === null)

  if (measured.length === 0) {
    return <p className="text-sm text-ink-subtle">Nothing has been recorded to average yet.</p>
  }

  return (
    <div className="space-y-2.5">
      {measured.map((row) => (
        <div key={row.metric}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink">{row.label}</span>
            <span className="text-sm tnum font-medium text-ink">{row.score!.toFixed(0)}</span>
          </div>
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
            <span
              style={{
                width: `${row.score}%`,
                background: BAND_COLOUR[
                  row.score! >= 85 ? 'EXCELLENT' : row.score! >= 70 ? 'GOOD' : row.score! >= 55 ? 'FAIR' : 'AT_RISK'
                ],
              }}
            />
          </div>
          <p className="mt-0.5 text-xs text-ink-subtle">
            averaged over {row.counted} {row.counted === 1 ? 'person' : 'people'}
          </p>
        </div>
      ))}

      {dark.length > 0 ? (
        <p className="pt-1 text-xs text-ink-subtle">
          Not yet measured anywhere: {dark.map((d) => d.label).join(', ')}.
        </p>
      ) : null}
    </div>
  )
}
