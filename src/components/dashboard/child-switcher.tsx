'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ScopedStudent } from '@/server/scope'
import { cn } from '@/lib/utils'

/**
 * Child switcher for parents with more than one student at the school.
 * One account, many children — switching is a view change, not a re-login,
 * so it reads as tabs over the page rather than as a set of buttons.
 */
export function ChildSwitcher({
  students,
  activeId,
}: {
  students: ScopedStudent[]
  activeId: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  const select = (id: string) => {
    const next = new URLSearchParams(params.toString())
    next.set('child', id)
    router.push(`?${next.toString()}`, { scroll: false })
  }

  return (
    <div
      className="flex gap-1 overflow-x-auto scroll-thin border-b border-line"
      role="tablist"
      aria-label="Select child"
    >
      {students.map((s) => {
        const active = s.id === activeId
        return (
          <button
            key={s.id}
            role="tab"
            aria-selected={active}
            onClick={() => select(s.id)}
            className={cn(
              'px-3 py-2 -mb-px border-b-2 text-left whitespace-nowrap transition-colors',
              active
                ? 'border-[var(--brand-500)] text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            <span className={cn('block text-base', active && 'font-medium')}>
              {s.firstName} {s.lastName}
            </span>
            <span className="block text-xs text-ink-subtle">
              {s.className ?? 'No class'}
              {s.sectionName ? ` · ${s.sectionName}` : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}
