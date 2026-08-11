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

/**
 * Vertical rhythm.
 *
 * Three step sizes and no others, so the page has a beat a visitor can feel
 * rather than a different gap between every pair of sections. `snug` is for a
 * section that continues the one above it; `loose` is for a section that has
 * to be arrived at.
 */
const SPACE = {
  snug: 'py-14 sm:py-[4.5rem]',
  default: 'py-16 sm:py-[6.5rem]',
  loose: 'py-20 sm:py-[8rem]',
}

export function Section({
  id,
  tone,
  space = 'default',
  className,
  children,
}: {
  id?: string
  tone?: 'paper' | 'page' | 'cream' | 'navy'
  space?: keyof typeof SPACE
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
    <section id={id} className={cn(SPACE[space], background, className)}>
      {children}
    </section>
  )
}
