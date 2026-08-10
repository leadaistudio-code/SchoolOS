import * as React from 'react'
import Link from 'next/link'
import { Icon } from '@/components/shell/icon'
import { formatNumber } from '@/lib/utils'
import { cn } from '@/lib/utils'

export type AttentionItem = {
  label: string
  value: number
  href: string
  icon: string
}

/**
 * The queue.
 *
 * A row of counts that are only interesting when they are not zero. A zero is
 * still shown — the absence of a problem is information — but it stays quiet,
 * so the eye lands on the one figure that needs a person.
 */
export function AttentionRow({ rows }: { rows: AttentionItem[] }) {
  const anything = rows.some((row) => row.value > 0)

  return (
    <section className="rise-in" aria-label="Needs attention">
      <h2 className="caption mb-2">
        Needs attention
        {!anything ? <span className="ml-2 normal-case tracking-normal text-success">All clear</span> : null}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => {
          const urgent = row.value > 0
          return (
            <Link
              key={row.label}
              href={row.href}
              className={cn(
                'widget lift flex items-center gap-3 px-4 py-3',
                urgent && 'border-[color-mix(in_srgb,var(--danger)_28%,var(--border))]',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-[10px]',
                  urgent ? 'bg-danger-bg text-[var(--danger)]' : 'bg-surface-3 text-ink-subtle',
                )}
              >
                <Icon name={row.icon} className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-sm text-ink-muted">{row.label}</span>
              <span
                className={cn(
                  'shrink-0 text-xl font-semibold tnum',
                  urgent ? 'text-[var(--danger)]' : 'text-ink-subtle',
                )}
              >
                {formatNumber(row.value)}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
