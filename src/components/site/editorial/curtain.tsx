import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The section curtain.
 *
 * In the reference each new ground does not begin where the last one ends — it
 * slides up over it, with a soft radius on its leading edge. That is built
 * here out of sticky positioning rather than scroll-linked transforms: the
 * outgoing section holds at the top of the viewport while the incoming one
 * travels over it under normal scrolling.
 *
 * Doing it this way means there is nothing to recalculate on resize, nothing
 * to refresh when fonts land, and no frame where a pinned section can be left
 * stranded — the failure modes that make scroll-jacked pages feel broken.
 */
export function CurtainStack({ children }: { children: React.ReactNode }) {
  return <div className="relative">{children}</div>
}

/** The section that is slid over. Holds while the next one arrives. */
export function CurtainBase({
  children,
  className,
}: {
  /** Optional: a zero-height base is a valid way to start a new stack. */
  children?: React.ReactNode
  className?: string
}) {
  return <div className={cn('sticky top-0', className)}>{children}</div>
}

/**
 * The section that slides over. Its radius and shadow are what sell the
 * overlap; without them the two grounds read as an ordinary hard cut.
 */
export function CurtainPanel({
  children,
  className,
  id,
  tone = 'paper',
}: {
  children: React.ReactNode
  className?: string
  id?: string
  tone?: 'paper' | 'black'
}) {
  return (
    <section
      id={id}
      className={cn(
        'relative z-10 rounded-t-[1.75rem] sm:rounded-t-[2.5rem]',
        'shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.45)]',
        tone === 'black' ? 'ed-black-ground' : 'ed-paper-ground',
        className,
      )}
    >
      {children}
    </section>
  )
}
