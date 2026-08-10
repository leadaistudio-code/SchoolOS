import * as React from 'react'
import Link from 'next/link'
import { cn, initials } from '@/lib/utils'
import { PortraitAvatar, type PortraitGender } from './portrait-avatar'

/**
 * Avatar tints.
 *
 * Most staff records have no photograph, so initials are the common case
 * rather than the fallback. Picking the tint from the name — rather than at
 * random or from a single grey — means the same person is the same colour on
 * every screen, which is what makes a list of initials scannable at all.
 */
const AVATAR_TINTS = [
  'bg-[var(--chart-students)]/15 text-[var(--chart-students)]',
  'bg-[var(--chart-staff)]/15 text-[var(--chart-staff)]',
  'bg-[var(--chart-parents)]/15 text-[var(--chart-parents)]',
  'bg-[var(--chart-fees)]/15 text-[var(--chart-fees)]',
  'bg-[var(--chart-overdue)]/15 text-[var(--chart-overdue)]',
  'bg-[var(--chart-admissions)]/15 text-[var(--chart-admissions)]',
] as const

export function avatarTint(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]!
}

/**
 * Person cell.
 *
 * The identity column of every roster in the product — students, staff,
 * guardians. One implementation so a name never renders three different ways
 * across three tables.
 */
export function PersonCell({
  firstName,
  lastName,
  secondary,
  href,
  avatarUrl,
  className,
}: {
  firstName: string
  lastName: string
  /** Admission number, employee code, relation — whatever identifies them. */
  secondary?: React.ReactNode
  href?: string
  avatarUrl?: string | null
  className?: string
}) {
  const inner = (
    <>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="size-7 rounded-full object-cover shrink-0" />
      ) : (
        <span
          className={cn(
            'size-7 rounded-full grid place-items-center text-xs font-semibold shrink-0',
            avatarTint(`${firstName}${lastName}`),
          )}
          aria-hidden
        >
          {initials(firstName, lastName)}
        </span>
      )}
      <span className="min-w-0">
        <span
          className={cn(
            'block text-sm text-ink truncate',
            href && 'group-hover:text-[var(--brand-600)]',
          )}
        >
          {firstName} {lastName}
        </span>
        {secondary ? (
          <span className="block text-xs text-ink-subtle truncate">{secondary}</span>
        ) : null}
      </span>
    </>
  )

  return href ? (
    <Link href={href} className={cn('group flex items-center gap-2 min-w-0', className)}>
      {inner}
    </Link>
  ) : (
    <span className={cn('flex items-center gap-2 min-w-0', className)}>{inner}</span>
  )
}

/**
 * Record avatar for detail pages. Neutral, not brand-filled — an initial is
 * an identifier, not a call to action.
 */
export function Avatar({
  firstName,
  lastName,
  avatarUrl,
  gender,
  status,
  className,
}: {
  firstName: string
  lastName: string
  avatarUrl?: string | null
  /**
   * Supplying this swaps the monogram fallback for an illustrated portrait.
   * Passed where a face is expected — a staff directory, a driver card — and
   * left off where a monogram reads better, such as a dense table.
   */
  gender?: PortraitGender
  /** Small corner dot, for presence or record state. */
  status?: 'online' | 'away' | 'offline'
  className?: string
}) {
  const face = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" className={cn('size-10 rounded-full object-cover shrink-0', className)} />
  ) : gender !== undefined ? (
    <PortraitAvatar seed={`${firstName} ${lastName}`} gender={gender} className={className} />
  ) : (
    <span
      className={cn(
        'size-10 rounded-full grid place-items-center text-base font-semibold shrink-0',
        avatarTint(`${firstName}${lastName}`),
        className,
      )}
      aria-hidden
    >
      {initials(firstName, lastName)}
    </span>
  )

  if (!status) return face

  return (
    <span className="relative inline-flex shrink-0">
      {face}
      <span
        className={cn(
          'absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-[var(--surface)]',
          status === 'online' && 'bg-success',
          status === 'away' && 'bg-warning',
          status === 'offline' && 'bg-line-strong',
        )}
        aria-hidden
      />
    </span>
  )
}

/** Class + section, formatted the same way everywhere it appears. */
export function ClassSection({
  className: klass,
  section,
  roll,
}: {
  className: string | null | undefined
  section?: string | null
  roll?: number | string | null
}) {
  if (!klass) return <span className="text-ink-subtle">—</span>
  return (
    <span className="text-sm text-ink-muted">
      {klass}
      {section ? ` · ${section}` : ''}
      {roll ? <span className="text-ink-subtle"> · Roll {roll}</span> : null}
    </span>
  )
}

/** A money amount that only draws attention when something is owed. */
export function DueAmount({ formatted, due }: { formatted: string; due: boolean }) {
  return (
    <span className={cn('text-sm tnum', due ? 'text-[var(--danger)] font-medium' : 'text-ink-subtle')}>
      {due ? formatted : '—'}
    </span>
  )
}
