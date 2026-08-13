'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { moveLeadStageAction } from './actions'
import { STAGE_LABELS, type LeadStage } from '@/lib/admissions'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type LeadCard = {
  id: string
  reference: string
  studentName: string
  parentName: string
  phone: string
  source: string | null
  stage: string
  className: string | null
  nextFollowUpOn: Date | string | null
}

const OPEN_BOARD: LeadStage[] = [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'CAMPUS_VISIT',
  'APPLICATION',
  'DOCUMENT_VERIFICATION',
  'APPROVED',
]

export function AdmissionsBoard({
  board,
  canManage,
}: {
  board: Record<string, LeadCard[]>
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  function onDrop(stage: LeadStage) {
    if (!dragging || !canManage) return
    const leadId = dragging
    setDragging(null)
    startTransition(async () => {
      const result = await moveLeadStageAction(leadId, stage)
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

      {/* Equal-width columns that share the page — no horizontal scroll */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {OPEN_BOARD.map((stage) => {
          const cards = board[stage] ?? []
          return (
            <section
              key={stage}
              className={cn(
                'min-w-0 rounded-[var(--radius-md)] border border-line bg-surface-2/40 p-1.5',
                dragging ? 'border-dashed border-[var(--brand-400)]' : null,
              )}
              onDragOver={(e) => {
                if (canManage) e.preventDefault()
              }}
              onDrop={() => onDrop(stage)}
            >
              <header className="mb-1.5 flex items-start justify-between gap-1 px-0.5">
                <h3 className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-ink-muted">
                  {STAGE_LABELS[stage]}
                </h3>
                <Badge tone="neutral">{cards.length}</Badge>
              </header>
              <ul className="max-h-[min(58vh,520px)] space-y-1.5 overflow-y-auto">
                {cards.map((lead) => (
                  <li key={lead.id}>
                    <article
                      draggable={canManage}
                      onDragStart={() => setDragging(lead.id)}
                      onDragEnd={() => setDragging(null)}
                      className="rounded-[var(--radius-sm)] border border-line bg-surface p-2 shadow-sm"
                    >
                      <Link href={`/admissions/${lead.id}`} className="block hover:underline">
                        <p className="truncate text-xs font-medium text-ink">{lead.studentName}</p>
                      </Link>
                      <p className="truncate text-[11px] text-ink-muted">{lead.parentName}</p>
                      <p className="mt-0.5 truncate text-[10px] text-ink-subtle tnum">{lead.reference}</p>
                      {lead.className ? (
                        <p className="mt-1 truncate text-[10px] text-[var(--brand-600)]">{lead.className}</p>
                      ) : null}
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(['ENROLLED', 'LOST'] as LeadStage[]).map((stage) => (
          <section key={stage} className="rounded-[var(--radius-md)] border border-line p-3">
            <header className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">{STAGE_LABELS[stage]}</h3>
              <Badge tone={stage === 'ENROLLED' ? 'success' : 'danger'}>
                {(board[stage] ?? []).length}
              </Badge>
            </header>
            <ul className="space-y-1.5">
              {(board[stage] ?? []).slice(0, 8).map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/admissions/${lead.id}`}
                    className="text-sm text-[var(--brand-600)] hover:underline"
                  >
                    {lead.studentName}
                  </Link>
                  <span className="text-xs text-ink-subtle"> · {lead.reference}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
