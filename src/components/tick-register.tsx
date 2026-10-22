'use client'

import * as React from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

export type TickRow = {
  studentId: string
  name: string
  admissionNo: string
  rollNumber: number | null
  sectionName: string | null
  done: boolean
  marks?: number | null
}

export type TickEntry = { studentId: string; done: boolean; marks: number | null }

/**
 * A class list with a tick per student, saved in one go.
 *
 * Built for the teacher at the front of the room: the whole class on one
 * screen, "Tick all" for the common case where nearly everyone did it, then
 * untick the few who did not. Marks are optional and only shown when the
 * activity has a maximum.
 */
export function TickRegister({
  rows,
  maxMarks = null,
  doneLabel,
  onSave,
}: {
  rows: TickRow[]
  maxMarks?: number | null
  doneLabel: string
  onSave: (entries: TickEntry[]) => Promise<{ ok: boolean; message: string }>
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [done, setDone] = React.useState<Record<string, boolean>>(
    () => Object.fromEntries(rows.map((r) => [r.studentId, r.done])),
  )
  const [marks, setMarks] = React.useState<Record<string, string>>(
    () => Object.fromEntries(rows.map((r) => [r.studentId, r.marks != null ? String(r.marks) : ''])),
  )
  const [dirty, setDirty] = React.useState(false)

  const count = rows.filter((r) => done[r.studentId]).length
  const showSections = new Set(rows.map((r) => r.sectionName)).size > 1

  const setAll = (value: boolean) => {
    setDone(Object.fromEntries(rows.map((r) => [r.studentId, value])))
    setDirty(true)
  }

  const save = () =>
    startTransition(async () => {
      const entries = rows.map((r) => {
        const text = marks[r.studentId]?.trim() ?? ''
        return { studentId: r.studentId, done: !!done[r.studentId], marks: text === '' ? null : Number(text) }
      })
      const bad = maxMarks !== null && entries.find((e) => e.marks !== null && (Number.isNaN(e.marks) || e.marks < 0 || e.marks > maxMarks))
      if (bad) {
        toast.push({ tone: 'error', title: 'Check the marks', description: `Marks must be between 0 and ${maxMarks}.` })
        return
      }
      const result = await onSave(entries)
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.ok ? 'Saved' : 'Could not save', description: result.message })
      if (result.ok) setDirty(false)
    })

  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-ink-muted">No students are enrolled in this class yet.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-line">
        <p className="text-sm text-ink">
          <span className="font-semibold tnum">{count}</span>
          <span className="text-ink-muted"> of {rows.length} {doneLabel}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setAll(true)}>Tick all</Button>
          <Button size="sm" variant="ghost" onClick={() => setAll(false)}>Clear</Button>
          <Button size="sm" loading={pending} onClick={save} disabled={!dirty && !pending}>
            <Save aria-hidden />
            Save
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {rows.map((r) => (
          <li key={r.studentId} className="flex items-center gap-3 px-4 py-2">
            <label className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!done[r.studentId]}
                onChange={(e) => {
                  setDone((d) => ({ ...d, [r.studentId]: e.target.checked }))
                  setDirty(true)
                }}
                className="size-5 shrink-0 rounded-[3px] border border-line-strong accent-[var(--brand-500)]"
              />
              <span className="w-10 shrink-0 text-xs text-ink-subtle tnum">{r.rollNumber ?? '—'}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{r.name}</span>
                <span className="block text-xs text-ink-subtle tnum">
                  {r.admissionNo}
                  {showSections && r.sectionName ? ` · Section ${r.sectionName}` : ''}
                </span>
              </span>
            </label>
            {maxMarks !== null ? (
              <Input
                aria-label={`Marks for ${r.name}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={maxMarks}
                step="any"
                placeholder={`/ ${maxMarks}`}
                className="w-20 h-8"
                value={marks[r.studentId] ?? ''}
                onChange={(e) => {
                  setMarks((m) => ({ ...m, [r.studentId]: e.target.value }))
                  if (e.target.value !== '') setDone((d) => ({ ...d, [r.studentId]: true }))
                  setDirty(true)
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
