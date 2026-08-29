import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { seriesSolidGradient, type SeriesKey } from '@/lib/chart-tones'

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
}: {
  label: string
  value: string
  sub?: React.ReactNode
  href?: string
  tone: SeriesKey
  icon?: React.ReactNode
  delayMs?: number
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

  const className =
    'rise-in lift relative block overflow-hidden rounded-[var(--radius-lg)] p-4 text-white transition-[transform,box-shadow] duration-150'
  const style = {
    backgroundImage: seriesSolidGradient(tone),
    ...(delayMs ? { animationDelay: `${delayMs}ms` } : {}),
  } as React.CSSProperties

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
