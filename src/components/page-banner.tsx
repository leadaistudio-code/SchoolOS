import * as React from 'react'
import { cn } from '@/lib/utils'
import { seriesBannerGradient, type SeriesKey } from '@/lib/chart-tones'

/**
 * Module hero strip — the dashboard greeting, adapted for inner pages.
 *
 * Carries the title, one factual line, optional actions, and a soft tint so
 * hub pages feel as alive as the home dashboard without repeating the
 * personalised greeting.
 */
export function PageBanner({
  title,
  description,
  actions,
  tone = 'students',
  media,
  className,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  tone?: SeriesKey
  media?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rise-in relative overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: seriesBannerGradient(tone) }}
        aria-hidden
      />

      <div className="relative flex flex-wrap items-center gap-4 px-5 py-5 sm:px-7 sm:py-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>

        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}

        {media ? <div className="hidden shrink-0 lg:block">{media}</div> : null}
      </div>
    </section>
  )
}
