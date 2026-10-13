'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { QuickAction } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { Icon } from './icon'

/**
 * Header shortcuts for the jobs a front desk does all day. Labels appear on
 * wide screens; narrower ones keep the coloured icons with a tooltip.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const pathname = usePathname()
  if (actions.length === 0) return null

  return (
    <nav aria-label="Quick actions" className="ml-2 hidden items-center gap-1 md:flex">
      {actions.map((action) => {
        const active = pathname === action.href || pathname.startsWith(`${action.href}/`)
        return (
          <Link
            key={action.href}
            href={action.href}
            title={action.label}
            aria-label={action.label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-1.5 text-xs font-semibold transition-colors 2xl:px-2.5',
              active ? '' : 'border-line hover:bg-surface-2',
            )}
            style={{
              color: `var(--chart-${action.tone})`,
              ...(active
                ? {
                    borderColor: `var(--chart-${action.tone})`,
                    background: `color-mix(in srgb, var(--chart-${action.tone}) 10%, transparent)`,
                  }
                : null),
            }}
          >
            <span
              className="grid size-6 place-items-center rounded-[7px]"
              style={{ background: `color-mix(in srgb, var(--chart-${action.tone}) 14%, transparent)` }}
              aria-hidden
            >
              <Icon name={action.icon} className="size-3.5" />
            </span>
            <span className="hidden text-ink 2xl:inline">{action.short}</span>
          </Link>
        )
      })}
    </nav>
  )
}
