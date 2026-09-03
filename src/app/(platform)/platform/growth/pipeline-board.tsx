'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { moveStageQuickAction } from './actions'
import { PIPELINE_COLUMNS, STAGE_LABELS, type CrmStage } from '@/lib/growth-crm'
import { Badge } from '@/components/ui/badge'
import { cn, formatMoney } from '@/lib/utils'

type Card = {
  id: string
  name: string
  city: string | null
  stage: string
  temperature: string
  dealValueMinor: number
  nextFollowUpAt: Date | string | null
  lastActivityAt: Date | string | null
  daysInStage: number
  stale: boolean
  noNextAction: boolean
  owner: { firstName: string; lastName: string } | null
  contacts: { fullName: string }[]
}

export function GrowthBoard({
  board,
  canEdit,
}: {
  board: Record<string, Card[]>
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  function onDrop(stage: CrmStage) {
    if (!dragging || !canEdit) return
    if (stage === 'LOST') {
      setError('Open the school to mark it lost — a reason is required.')
      setDragging(null)
      return
    }
    const id = dragging
    setDragging(null)
    startTransition(async () => {
      const result = await moveStageQuickAction(id, stage)
      if (!result.ok) setError(result.message)
      else {
        setError(null)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {pending ? <p className="text-xs text-ink-subtle">Updating stage…</p> : null}

      <div className="flex gap-2 overflow-x-auto pb-2">
        {PIPELINE_COLUMNS.map((stage) => {
          const cards = board[stage] ?? []
          return (
            <section
              key={stage}
              className={cn(
                'w-[220px] shrink-0 rounded-[var(--radius-md)] border border-line bg-surface-2/40 p-1.5',
                dragging ? 'border-dashed border-[var(--brand-400)]' : null,
              )}
              onDragOver={(e) => {
                if (canEdit) e.preventDefault()
              }}
              onDrop={() => onDrop(stage)}
            >
              <header className="mb-1.5 flex items-start justify-between gap-1 px-0.5">
                <h3 className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-ink-muted">
                  {STAGE_LABELS[stage]}
                </h3>
                <Badge tone="neutral">{cards.length}</Badge>
              </header>
              <ul className="max-h-[min(62vh,560px)] space-y-1.5 overflow-y-auto">
                {cards.map((school) => (
                  <li key={school.id}>
                    <article
                      draggable={canEdit}
                      onDragStart={() => setDragging(school.id)}
                      onDragEnd={() => setDragging(null)}
                      className="rounded-[var(--radius-sm)] border border-line bg-surface p-2 shadow-sm"
                    >
                      <Link href={`/platform/growth/schools/${school.id}`} className="block hover:underline">
                        <p className="truncate text-xs font-medium text-ink">{school.name}</p>
                      </Link>
                      <p className="truncate text-[11px] text-ink-muted">
                        {[school.city, school.contacts[0]?.fullName].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <p className="mt-1 flex items-center justify-between gap-1 text-[10px] text-ink-subtle">
                        <span className="tnum">{school.dealValueMinor ? formatMoney(school.dealValueMinor) : '—'}</span>
                        <span>{school.temperature.toLowerCase()}</span>
                      </p>
                      {school.noNextAction ? (
                        <p className="mt-1 text-[10px] font-medium text-warning">No next action</p>
                      ) : null}
                      {school.stale || school.daysInStage >= 14 ? (
                        <p className="mt-0.5 text-[10px] text-[var(--danger)]">
                          {school.stale ? 'No activity 7+ days' : `${school.daysInStage}d in stage`}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[10px] text-ink-subtle">{school.daysInStage}d in stage</p>
                      )}
                      {school.owner ? (
                        <p className="truncate text-[10px] text-ink-subtle">
                          {school.owner.firstName} {school.owner.lastName}
                        </p>
                      ) : null}
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
