import * as React from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TabItem = {
  label: string
  href: string
  active: boolean
  count?: number
  icon?: LucideIcon
  /** Any CSS colour; defaults to a colour picked from the tab's position. */
  accent?: string
}

const ACCENTS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316']

const tint = (pct: number) => `color-mix(in srgb, var(--tab) ${pct}%, transparent)`

/**
 * Navigational tabs: a segmented bar where each tab carries its own accent
 * colour, so sections are recognisable at a glance.
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
      className={cn(
        'no-print overflow-x-auto scroll-thin rounded-xl border border-line bg-surface p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        className,
      )}
    >
      <ul className="flex min-w-max items-center gap-1">
        {items.map((item, i) => {
          const Icon = item.icon
          const style = { '--tab': item.accent ?? ACCENTS[i % ACCENTS.length] } as React.CSSProperties
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                style={style}
                className={cn(
                  'group relative inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150',
                  item.active
                    ? 'font-semibold text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-lg transition-opacity duration-150"
                  style={{
                    background: item.active
                      ? `linear-gradient(135deg, ${tint(16)}, ${tint(6)})`
                      : tint(8),
                    opacity: item.active ? 1 : 0,
                    boxShadow: item.active ? `inset 0 0 0 1px ${tint(28)}` : undefined,
                  }}
                />
                {!item.active ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ background: tint(8) }}
                  />
                ) : null}
                {Icon ? (
                  <span
                    aria-hidden
                    className="relative grid size-6 place-items-center rounded-md transition-colors"
                    style={
                      item.active
                        ? { background: 'var(--tab)', color: '#fff', boxShadow: `0 2px 6px ${tint(40)}` }
                        : { background: tint(12), color: 'var(--tab)' }
                    }
                  >
                    <Icon className="size-3.5" strokeWidth={2.25} />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="relative size-2 rounded-full"
                    style={{ background: 'var(--tab)', opacity: item.active ? 1 : 0.55 }}
                  />
                )}
                <span className="relative">{item.label}</span>
                {item.count !== undefined ? (
                  <span
                    className="relative rounded-full px-1.5 py-px text-[11px] font-semibold tnum"
                    style={{ background: tint(item.active ? 22 : 12), color: 'var(--tab)' }}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
