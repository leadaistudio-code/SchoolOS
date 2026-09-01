import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { seriesSolidGradient, type SeriesKey } from '@/lib/chart-tones'
import { buttonVariants } from '@/components/ui/button-variants'

/** Secondary action on a colour banner (ghost white outline). */
export function colorBannerSecondaryBtn(...extra: (string | undefined)[]) {
  return cn(
    buttonVariants({ variant: 'secondary', size: 'sm' }),
    'border-white/30 bg-white/15 text-white hover:bg-white/25 hover:text-white',
    ...extra,
  )
}

/** Primary action on a colour banner (solid white chip). */
export function colorBannerPrimaryBtn(...extra: (string | undefined)[]) {
  return cn(
    buttonVariants({ size: 'sm' }),
    'bg-white text-ink hover:bg-white/90',
    ...extra,
  )
}

/**
 * Full-colour module hero — same language as the Admissions dashboard banner.
 *
 * Eyebrow + headline + one supporting line + optional CTA, with room for a
 * scene illustration on the right. White type on a saturated series colour.
 */
export function ColorBanner({
  eyebrow,
  title,
  description,
  href,
  cta,
  tone,
  media,
  actions,
  className,
}: {
  eyebrow: string
  title: React.ReactNode
  description?: React.ReactNode
  href?: string
  cta?: string
  tone: SeriesKey
  media?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rise-in relative overflow-hidden rounded-[var(--radius-lg)] p-4 text-white sm:p-5',
        className,
      )}
      style={{ backgroundImage: seriesSolidGradient(tone) }}
    >
      <div className={cn('relative z-10 max-w-[70%]', media && 'pr-4')}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
          {eyebrow}
        </p>
        <p className="mt-1 text-lg font-semibold leading-tight text-balance sm:text-xl">{title}</p>
        {description ? (
          <p className="mt-1 text-sm text-white/85 text-pretty">{description}</p>
        ) : null}
        {href && cta ? (
          <Link
            href={href}
            className="mt-3 inline-flex text-sm font-semibold text-white underline-offset-2 hover:underline"
          >
            {cta}
          </Link>
        ) : null}
        {actions ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {media ? (
        <div className="pointer-events-none absolute -bottom-2 right-1 opacity-95" aria-hidden>
          {media}
        </div>
      ) : null}
    </section>
  )
}

/**
 * Saturated KPI tile — figure + short label on the series colour, optional link.
 */
export function ColorTile({
  label,
  value,
  sub,
  href,
  tone,
  icon,
  delayMs,
  active,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  href?: string
  tone: SeriesKey
  icon?: React.ReactNode
  delayMs?: number
  /** Highlights the tile when it matches the current filter or view. */
  active?: boolean
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{label}</p>
        {icon ? <span className="shrink-0 text-white/80">{icon}</span> : null}
      </div>
      <p className="mt-2 text-3xl font-semibold leading-none tnum text-white">{value}</p>
      {sub ? <p className="mt-2 text-sm text-white/85">{sub}</p> : null}
    </>
  )

  const className = cn(
    'rise-in lift relative block overflow-hidden rounded-[var(--radius-lg)] p-4 text-white transition-[transform,box-shadow,opacity] duration-150',
    href &&
      'cursor-pointer hover:scale-[1.01] hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80',
    active && 'ring-2 ring-white/90 ring-offset-2 ring-offset-[color-mix(in_srgb,var(--surface)_30%,transparent)]',
  )
  const style = {
    backgroundImage: seriesSolidGradient(tone),
    ...(delayMs ? { animationDelay: `${delayMs}ms` } : {}),
  } as React.CSSProperties

  return href ? (
    <Link href={href} className={className} style={style} aria-current={active ? 'page' : undefined}>
      {body}
    </Link>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  )
}
