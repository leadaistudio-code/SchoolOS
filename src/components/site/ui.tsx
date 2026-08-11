import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModuleStatus } from '@/content/site/modules'
import { STATUS_LABEL } from '@/content/site/modules'
import type { IntegrationStatus } from '@/content/site/integrations'
import { INTEGRATION_STATUS_LABEL } from '@/content/site/integrations'

/**
 * The site's primitives.
 *
 * Three button shapes, one section header, one status badge. Anything that
 * needs a fourth variant is usually a layout decision that has not been made
 * yet — the point of keeping this list short is that two sections written a
 * month apart still look like the same website.
 */

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg text-[15px] font-medium transition-colors duration-150 disabled:opacity-60'

const BUTTON_SIZE = {
  md: 'px-4 py-2.5',
  lg: 'px-5 py-3 text-[16px]',
}

const BUTTON_TONE = {
  /** The primary action. Navy, not a gradient. */
  primary: 'bg-[var(--ink)] text-white hover:bg-[var(--navy-soft)]',
  /** Secondary, on a light ground. */
  secondary:
    'border border-[var(--rule-strong)] bg-white text-[var(--text)] hover:border-[var(--ink)]',
  /** Primary on navy. */
  onDark: 'bg-white text-[var(--ink)] hover:bg-[#e7ebf5]',
  /** Secondary on navy. */
  onDarkGhost: 'border border-white/25 text-white hover:border-white/60',
}

export function Button({
  href,
  tone = 'primary',
  size = 'md',
  className,
  children,
}: {
  href: string
  tone?: keyof typeof BUTTON_TONE
  size?: keyof typeof BUTTON_SIZE
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_TONE[tone], className)}
    >
      {children}
    </Link>
  )
}

/** A text link that ends a section. The arrow moves; nothing else does. */
export function TextLink({
  href,
  children,
  onDark,
  className,
}: {
  href: string
  children: React.ReactNode
  onDark?: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex items-center gap-1.5 text-[16px] font-medium',
        onDark ? 'text-white' : 'text-[var(--blue)] hover:text-[var(--blue-deep)]',
        className,
      )}
    >
      {children}
      <ArrowRight
        className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  )
}

/**
 * Section headers.
 *
 * Two alignments only: stacked (heading over lead, left-aligned, narrow) and
 * split (heading left, lead right). Centred headings are not used — a centred
 * heading with a centred paragraph under it is the single most recognisable
 * tell of a generated page.
 */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  split,
  action,
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  lead?: React.ReactNode
  split?: boolean
  action?: React.ReactNode
  className?: string
}) {
  if (split) {
    return (
      <div
        className={cn(
          'grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end md:gap-16',
          className,
        )}
      >
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2 className="display mt-3 text-[clamp(1.9rem,3.6vw,2.85rem)]">{title}</h2>
        </div>
        <div>
          {lead ? <p className="muted max-w-xl text-[18px] leading-[1.55]">{lead}</p> : null}
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('max-w-2xl', className)}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2 className="display mt-3 text-[clamp(1.9rem,3.6vw,2.85rem)]">{title}</h2>
      {lead ? <p className="muted mt-5 text-[18px] leading-[1.55]">{lead}</p> : null}
      {action ? <div className="mt-7">{action}</div> : null}
    </div>
  )
}

/**
 * Status.
 *
 * The only coloured chip on the site, and it exists for one reason: a visitor
 * must be able to tell at a glance whether something is built. Available is
 * deliberately quiet — grey, not green — so that "in build" and "planned"
 * stand out as the exceptions they are.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: ModuleStatus | IntegrationStatus
  className?: string
}) {
  const label =
    status === 'available'
      ? 'Available'
      : status === 'ready'
        ? INTEGRATION_STATUS_LABEL.ready
        : STATUS_LABEL[status as ModuleStatus]

  const tone =
    status === 'available'
      ? 'border-[var(--rule-strong)] text-[var(--text-subtle)]'
      : status === 'planned'
        ? 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] text-[var(--accent)]'
        : 'border-[color-mix(in_srgb,var(--blue)_28%,transparent)] bg-[var(--blue-tint)] text-[var(--blue-deep)]'

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em]',
        tone,
        className,
      )}
    >
      {label}
    </span>
  )
}

/**
 * The sample-content marker.
 *
 * Used on case studies and testimonials that are layout rather than fact. It
 * is meant to be noticed: an unmarked placeholder eventually gets published.
 */
export function SampleMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border border-dashed border-[var(--rule-strong)] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-subtle)]',
        className,
      )}
    >
      Sample layout
    </span>
  )
}

/**
 * A framed product surface.
 *
 * Real application components go inside this. Straight on, one hairline, one
 * soft shadow — the frame says "this is software", and then gets out of the way.
 */
export function ProductFrame({
  label,
  children,
  className,
}: {
  /** What the visitor is looking at. Read by screen readers too. */
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <figure className={cn('screen shadow-lift', className)}>
      <div className="screen-chrome">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[var(--rule-strong)]" />
          <span className="size-2.5 rounded-full bg-[var(--rule-strong)]" />
          <span className="size-2.5 rounded-full bg-[var(--rule-strong)]" />
        </span>
        <figcaption className="ml-1 truncate text-[13px] text-[var(--text-subtle)]">
          {label}
        </figcaption>
      </div>
      {children}
    </figure>
  )
}
