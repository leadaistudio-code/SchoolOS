'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ScopedStudent } from '@/server/scope'
import { cn, initials } from '@/lib/utils'

/**
 * Child switcher for parents with more than one student at the school.
 * One account, many children - switching is a view change, not a re-login.
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
      className="flex gap-2 overflow-x-auto scroll-thin pb-1 -mx-1 px-1"
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
              'flex items-center gap-2.5 rounded-full border pl-1 pr-3.5 py-1 shrink-0 transition-colors',
              active
                ? 'border-[var(--brand-500)] bg-[var(--brand-50)]'
                : 'border-line bg-surface hover:bg-surface-2',
            )}
          >
            <span
              className={cn(
                'size-7 rounded-full grid place-items-center text-[11px] font-semibold',
                active
                  ? 'bg-[var(--brand-500)] text-[var(--brand-contrast)]'
                  : 'bg-surface-2 text-ink-muted',
              )}
            >
              {initials(s.firstName, s.lastName)}
            </span>
            <span className="text-left leading-tight">
              <span
                className={cn(
                  'block text-[13px] font-medium',
                  active ? 'text-[var(--brand-700)]' : 'text-ink',
                )}
              >
                {s.firstName}
              </span>
              <span className="block text-[11px] text-ink-subtle">
                {s.className ?? 'No class'}
                {s.sectionName ? ` ${s.sectionName}` : ''}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
