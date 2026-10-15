import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * An aggregated figure that opens the entries behind it. The href is a signed
 * drill descriptor built on the server (`drillHref`); without one the figure
 * renders as plain text, so a user without the permission sees no dead link.
 */
export function DrillFigure({
  href,
  children,
  className,
  title = 'Show how this figure is made up',
}: {
  href?: string | null
  children: React.ReactNode
  className?: string
  title?: string
}) {
  if (!href) return <span className={cn('tnum', className)}>{children}</span>
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        'tnum underline decoration-dotted decoration-ink-subtle underline-offset-4 hover:text-[var(--brand-600)] hover:decoration-solid',
        className,
      )}
    >
      {children}
    </Link>
  )
}
