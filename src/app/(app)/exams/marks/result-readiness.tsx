'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Calculator, CheckCircle2, Hourglass } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { computeResultsAction } from '../actions'

type Group = {
  key: string
  examId: string
  examName: string
  examStatus: string
  classLevelId: string
  className: string
  sheets: number
  complete: number
  closed: number
  pending: string[]
  ready: boolean
  results: number
}

/**
 * Per exam × class result generation. A class is ready once every paper has
 * all its marks or has been closed without marks; generating earlier still
 * works for the students whose own papers are complete.
 */
export function ResultReadiness({ groups }: { groups: Group[] }) {
  const toast = useToast()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const generate = (group: Group) => {
    if (group.examStatus === 'PUBLISHED' && !window.confirm(`${group.examName} is already published.\n\nRecalculating updates the published totals, grades and ranks for ${group.className}; parents and students see the new figures straight away.${group.pending.length ? `\n\nStill pending: ${group.pending.join(', ')}. Students missing those marks keep their current result.` : ''}`)) return
    if (group.examStatus !== 'PUBLISHED' && !group.ready && !window.confirm(`${group.className} still has ${group.pending.length} paper${group.pending.length === 1 ? '' : 's'} pending (${group.pending.join(', ')}).\n\nGenerate results now for the students whose papers are complete? Close the pending papers without marks first if they will not be evaluated.`)) return
    setBusy(group.key)
    start(async () => {
      const result = await computeResultsAction(group.examId, group.classLevelId)
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.message })
      setBusy(null)
    })
  }

  return (
    <ul className="divide-y divide-line">
      {groups.map((group) => {
        const published = group.examStatus === 'PUBLISHED'
        return (
          <li key={group.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                {group.examName} · {group.className}
                {published ? (
                  <Badge tone="brand">Published</Badge>
                ) : group.ready ? (
                  <Badge tone="success"><CheckCircle2 className="size-3" aria-hidden /> Ready</Badge>
                ) : (
                  <Badge tone="warning"><Hourglass className="size-3" aria-hidden /> {group.pending.length} pending</Badge>
                )}
              </p>
              <p className="mt-0.5 text-xs text-ink-subtle">
                {group.complete} of {group.sheets} papers complete
                {group.closed ? ` · ${group.closed} closed without marks` : ''}
                {group.pending.length ? ` · waiting on ${group.pending.join(', ')}` : ''}
                {group.results ? ` · ${group.results} results generated` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {group.results ? (
                <Link href={`/exams/results?exam=${group.examId}`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">
                  {published ? 'View results' : 'Review & publish'}
                </Link>
              ) : null}
              <Button size="sm" variant={group.ready ? 'primary' : 'secondary'} onClick={() => generate(group)} loading={pending && busy === group.key} disabled={pending}>
                <Calculator aria-hidden />
                {published ? 'Recalculate results' : group.results ? 'Regenerate results' : 'Generate results'}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
