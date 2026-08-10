import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The frame every dashboard panel sits in.
 *
 * Defined once so twelve widgets cannot drift apart on padding, corner radius
 * or where the "see everything" link goes. A widget supplies a title, an
 * optional action, and its content; it never draws its own border.
 */
export function Widget({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
  /** Staggers the entrance so the page assembles rather than snapping in. */
  delayMs,
}: {
  title?: string
  subtitle?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  delayMs?: number
}) {
  return (
    <section
      className={cn('widget rise-in flex flex-col overflow-hidden', className)}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {title ? (
        <header className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
            {subtitle ? (
              <p className="truncate text-xs text-ink-subtle">{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn('min-w-0 flex-1', bodyClassName ?? 'p-4')}>{children}</div>
    </section>
  )
}

/** The standard "go to the full screen" link in a widget header. */
export function WidgetLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs font-medium text-[var(--product-600)] transition-colors hover:bg-[var(--product-50)]"
    >
      {children}
      <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
