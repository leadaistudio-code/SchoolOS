import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The measure.
 *
 * Two widths only. `page` is the reading width for text and most product
 * compositions; `wide` is for the few sections that run edge to edge. Anything
 * needing a third width is usually a layout that has not been decided yet.
 */
export function Container({
  wide,
  className,
  children,
}: {
  wide?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn('mx-auto w-full px-[var(--gutter)]', className)}
      style={{ maxWidth: wide ? 'var(--wide-max)' : 'var(--page-max)' }}
    >
      {children}
    </div>
  )
}

/** Vertical rhythm. Sections breathe, but not so much that the page feels empty. */
export function Section({
  id,
  tone,
  className,
  children,
}: {
  id?: string
  tone?: 'paper' | 'page' | 'cream' | 'navy'
  className?: string
  children: React.ReactNode
}) {
  const background =
    tone === 'navy'
      ? 'on-navy'
      : tone === 'cream'
        ? 'bg-[var(--cream)]'
        : tone === 'page'
          ? 'bg-[var(--page)]'
          : 'bg-[var(--paper)]'

  return (
    <section id={id} className={cn('py-16 sm:py-24', background, className)}>
      {children}
    </section>
  )
}
