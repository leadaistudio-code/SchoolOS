'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setViewSessionAction } from './view-session-actions'

export type SessionOption = { id: string; name: string; isCurrent: boolean }

/**
 * Picks the session Fees, Expenses and Accounts show. A past session is
 * highlighted so nobody mistakes last year's figures for this year's.
 */
export function SessionSwitcher({ sessions, selectedId }: { sessions: SessionOption[]; selectedId: string }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const selected = sessions.find((s) => s.id === selectedId)
  const past = selected ? !selected.isCurrent : false

  return (
    <label
      className={cn(
        'relative hidden items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-xs font-medium sm:inline-flex',
        past ? 'border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-warning-bg text-warning' : 'border-line text-ink-muted',
        pending && 'opacity-60',
      )}
      title={past ? 'Viewing a past session. Fees, expenses and accounts show this session.' : 'Academic session'}
    >
      <CalendarDays className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">Academic session</span>
      <select
        value={selectedId}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value
          startTransition(async () => {
            await setViewSessionAction(id)
            router.refresh()
          })
        }}
        className="cursor-pointer appearance-none bg-transparent pr-1 font-medium outline-none"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.isCurrent ? ' (current)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
