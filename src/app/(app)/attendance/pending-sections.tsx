'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCheck } from 'lucide-react'
import { bulkMarkSectionsAction } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

type PendingSection = { id: string; label: string; enrolled: number; marked: number }

const BULK_STATUSES = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LEAVE', label: 'Leave' },
] as const

/**
 * Sections still unmarked for the date, with a bulk action: tick several and
 * mark every unmarked student in them at once. Students already marked keep
 * their status; students on approved leave are marked as on leave.
 */
export function PendingSections({
  pending,
  onDate,
  canMark,
}: {
  pending: PendingSection[]
  onDate: string
  canMark: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(pending.map((s) => s.id)))
  const [status, setStatus] = React.useState<(typeof BULK_STATUSES)[number]['value']>('PRESENT')
  const [busy, startTransition] = React.useTransition()
  const key = pending.map((s) => s.id).join('|')

  React.useEffect(() => {
    setSelected(new Set(key ? key.split('|') : []))
  }, [key])

  const allSelected = pending.length > 0 && pending.every((s) => selected.has(s.id))
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const run = () => {
    const ids = pending.filter((s) => selected.has(s.id)).map((s) => s.id)
    if (ids.length === 0) return
    const students = pending.filter((s) => selected.has(s.id)).reduce((sum, s) => sum + (s.enrolled - s.marked), 0)
    const label = BULK_STATUSES.find((s) => s.value === status)!.label.toLowerCase()
    if (!window.confirm(`Mark ${students} unmarked student${students === 1 ? '' : 's'} in ${ids.length} section${ids.length === 1 ? '' : 's'} as ${label} for ${onDate}?`)) return
    startTransition(async () => {
      const result = await bulkMarkSectionsAction({ sectionIds: ids, onDate, status })
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.ok ? 'Attendance saved' : 'Could not save', description: result.message })
      if (result.ok) router.refresh()
    })
  }

  return (
    <Card id="pending-sections" variant="elevated" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Not yet marked</CardTitle>
      </CardHeader>
      <CardContent className="py-1">
        {pending.length === 0 ? (
          <EmptyState title="Every section is marked" description="Nothing outstanding for this date." />
        ) : (
          <>
            {canMark ? (
              <label className="flex items-center gap-2 border-b border-line py-2 text-xs font-medium text-ink-muted">
                <Checkbox
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(pending.map((s) => s.id)))}
                  aria-label="Select all unmarked sections"
                />
                Select all
              </label>
            ) : null}
            <ul className="divide-y divide-[var(--border)]">
              {pending.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  {canMark ? (
                    <Checkbox checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.label}`} />
                  ) : null}
                  <Link
                    href={`/attendance?sectionId=${s.id}&onDate=${onDate}`}
                    className="mr-auto text-sm text-ink hover:text-[var(--brand-600)]"
                  >
                    {s.label}
                  </Link>
                  <span className="text-xs tnum text-ink-subtle">
                    <span className={s.marked === 0 ? 'text-[var(--danger)] font-medium' : 'text-warning font-medium'}>
                      {s.marked}
                    </span>
                    /{s.enrolled}
                  </span>
                </li>
              ))}
            </ul>
            {canMark ? (
              <div className="space-y-2 border-t border-line py-3">
                <p className="text-xs text-ink-subtle">
                  Bulk mark the ticked sections. Students already marked keep their status; approved leave is kept.
                </p>
                <div className="flex items-center gap-2">
                  <Select
                    aria-label="Status to mark"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as typeof status)}
                    className="h-9 w-28"
                  >
                    {BULK_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </Select>
                  <Button size="sm" className="flex-1" onClick={run} loading={busy} disabled={selected.size === 0}>
                    {!busy ? <CheckCheck aria-hidden /> : null}
                    Mark {selected.size} section{selected.size === 1 ? '' : 's'}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
