import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type TabItem = { label: string; href: string; active: boolean; count?: number }

/**
 * Navigational tabs.
 *
 * Used wherever a page shows the same table for a different subject, exam or
 * term. An underline rather than a row of pills: pills read as buttons, and
 * these change what you are looking at, not what happens next.
 */
export function LinkTabs({
  items,
  label,
  className,
}: {
  items: TabItem[]
  label: string
  className?: string
}) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label={label}
      className={cn('border-b border-line -mx-1 overflow-x-auto scroll-thin', className)}
    >
      <ul className="flex items-center gap-1 min-w-max px-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-2 text-base border-b-2 -mb-px transition-colors whitespace-nowrap',
                item.active
                  ? 'border-[var(--brand-500)] text-ink font-medium'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {item.label}
              {item.count !== undefined ? (
                <span className="text-xs text-ink-subtle tnum">{item.count}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
