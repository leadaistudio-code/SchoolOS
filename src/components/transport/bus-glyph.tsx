import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The school bus mark.
 *
 * Drawn here rather than pulled from the icon set because the bus is the one
 * object this module is about: it appears as the marker on the live map, as
 * the avatar on a fleet row, and as the empty-state figure, and it has to hold
 * up at 16px and at 96px. A stroke icon dissolves at map scale, so this is a
 * filled mark with a windscreen, a body band and wheels — recognisable as a
 * bus from across the room.
 */
export function BusGlyph({
  className,
  title,
}: {
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-6', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {/* Body */}
      <path
        d="M4.4 4.8c0-1 .8-1.8 1.8-1.8h11.6c1 0 1.8.8 1.8 1.8v11.9c0 .7-.4 1.3-1 1.6v1.4c0 .7-.6 1.3-1.3 1.3h-.9c-.7 0-1.3-.6-1.3-1.3v-1.1H8.9v1.1c0 .7-.6 1.3-1.3 1.3h-.9c-.7 0-1.3-.6-1.3-1.3v-1.4c-.6-.3-1-.9-1-1.6V4.8Z"
        fill="currentColor"
      />
      {/* Windows — punched out so the mark reads at small sizes */}
      <path
        d="M6.6 6.1c0-.5.4-.9.9-.9h8.9c.5 0 .9.4.9.9v3.6c0 .5-.4.9-.9.9H7.5a.9.9 0 0 1-.9-.9V6.1Z"
        fill="var(--surface)"
        opacity="0.92"
      />
      {/* Wheels */}
      <circle cx="8" cy="15.6" r="1.5" fill="var(--surface)" opacity="0.92" />
      <circle cx="16" cy="15.6" r="1.5" fill="var(--surface)" opacity="0.92" />
    </svg>
  )
}

/** The bus mark in a tinted round chip — used as the avatar on fleet rows. */
export function BusAvatar({
  tone = 'brand',
  className,
}: {
  tone?: 'brand' | 'muted' | 'success' | 'danger'
  className?: string
}) {
  const tones = {
    brand: 'bg-[var(--brand-50)] text-[var(--brand-600)]',
    muted: 'bg-surface-3 text-ink-subtle',
    success: 'bg-success-bg text-success',
    danger: 'bg-danger-bg text-[var(--danger)]',
  } as const

  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', tones[tone], className)}>
      <BusGlyph className="size-5" />
    </span>
  )
}
