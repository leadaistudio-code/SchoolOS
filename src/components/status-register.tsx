'use client'

import * as React from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { passFail, type RegisterOption } from '@/lib/registers'

export type RegisterRow = {
  studentId: string
  name: string
  admissionNo: string
  rollNumber: number | null
  sectionName: string | null
  status: string | null
  marks?: number | null
  /** Short note under the name, e.g. "Handed in on the portal". */
  hint?: string | null
}

export type RegisterEntry = { studentId: string; status: string | null; marks: number | null }

/**
 * A class list with a status per student, saved in one go.
 *
 * Built for the teacher at the front of the room: "Set all to" for the common
 * case, then change the few exceptions. Marks are only shown when the
 * activity has a maximum, and only for statuses in `markable`.
 */
export function StatusRegister({
  rows,
  options,
  countAs,
  countLabel,
  maxMarks = null,
  passingMarks = null,
  markable = [],
  onSave,
}: {
  rows: RegisterRow[]
  options: RegisterOption[]
  /** Statuses counted in the headline figure. */
  countAs: readonly string[]
  countLabel: string
  maxMarks?: number | null
  passingMarks?: number | null
  markable?: readonly string[]
  onSave: (entries: RegisterEntry[]) => Promise<{ ok: boolean; message: string }>
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [status, setStatus] = React.useState<Record<string, string>>(
    () => Object.fromEntries(rows.map((r) => [r.studentId, r.status ?? ''])),
  )
  const [marks, setMarks] = React.useState<Record<string, string>>(
    () => Object.fromEntries(rows.map((r) => [r.studentId, r.marks != null ? String(r.marks) : ''])),
  )
  const [dirty, setDirty] = React.useState(false)

  const optionOf = new Map(options.map((o) => [o.value, o]))
  const count = rows.filter((r) => countAs.includes(status[r.studentId] ?? '')).length
  const unmarked = rows.filter((r) => !status[r.studentId]).length
  const tally = options
    .map((o) => ({ ...o, n: rows.filter((r) => status[r.studentId] === o.value).length }))
    .filter((o) => o.n > 0)
  const showSections = new Set(rows.map((r) => r.sectionName)).size > 1
  const withMarks = maxMarks !== null && markable.length > 0
  const firstMarkable = markable[0] ?? ''

  const setAll = (value: string) => {
    setStatus(Object.fromEntries(rows.map((r) => [r.studentId, value])))
    if (!markable.includes(value)) setMarks(Object.fromEntries(rows.map((r) => [r.studentId, ''])))
    setDirty(true)
  }

  const save = () =>
    startTransition(async () => {
      const entries = rows.map((r) => {
        const text = marks[r.studentId]?.trim() ?? ''
        return { studentId: r.studentId, status: status[r.studentId] || null, marks: text === '' ? null : Number(text) }
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
        <div className="space-y-1">
          <p className="text-sm text-ink">
            <span className="font-semibold tnum">{count}</span>
            <span className="text-ink-muted"> of {rows.length} {countLabel}</span>
            {unmarked > 0 ? <span className="text-ink-subtle"> · {unmarked} not marked</span> : null}
          </p>
          {tally.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tally.map((o) => (
                <Badge key={o.value} tone={o.tone}>
                  {o.label} <span className="tnum">{o.n}</span>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Select
            aria-label="Set every student to"
            className="h-8 w-auto text-sm"
            value=""
            onChange={(e) => {
              if (e.target.value === '__clear') setAll('')
              else if (e.target.value) setAll(e.target.value)
            }}
          >
            <option value="">Set all to…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
            <option value="__clear">Clear all</option>
          </Select>
          <Button size="sm" loading={pending} onClick={save} disabled={!dirty && !pending}>
            <Save aria-hidden />
            Save
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {rows.map((r) => {
          const value = status[r.studentId] ?? ''
          const option = optionOf.get(value)
          const markText = marks[r.studentId] ?? ''
          const result = passFail(markText === '' ? null : Number(markText), passingMarks)
          const canMark = !value || markable.includes(value)
          return (
            <li key={r.studentId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
              <span className="w-10 shrink-0 text-xs text-ink-subtle tnum">{r.rollNumber ?? '—'}</span>
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate text-sm text-ink">{r.name}</span>
                <span className="block text-xs text-ink-subtle tnum">
                  {r.admissionNo}
                  {showSections && r.sectionName ? ` · Section ${r.sectionName}` : ''}
                  {r.hint ? ` · ${r.hint}` : ''}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <Select
                  aria-label={`Status for ${r.name}`}
                  className="h-8 w-48 text-sm"
                  data-tone={option?.tone ?? 'none'}
                  value={value}
                  onChange={(e) => {
                    const next = e.target.value
                    setStatus((s) => ({ ...s, [r.studentId]: next }))
                    if (next && !markable.includes(next)) setMarks((m) => ({ ...m, [r.studentId]: '' }))
                    setDirty(true)
                  }}
                >
                  <option value="">Not marked</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
                {withMarks ? (
                  <Input
                    aria-label={`Marks for ${r.name}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={maxMarks ?? undefined}
                    step="any"
                    placeholder={`/ ${maxMarks}`}
                    className="w-20 h-8"
                    disabled={!canMark}
                    value={markText}
                    onChange={(e) => {
                      setMarks((m) => ({ ...m, [r.studentId]: e.target.value }))
                      if (e.target.value !== '' && !value) setStatus((s) => ({ ...s, [r.studentId]: firstMarkable }))
                      setDirty(true)
                    }}
                  />
                ) : null}
                {passingMarks !== null ? (
                  <span className="w-11">
                    {result ? <Badge tone={result === 'PASS' ? 'success' : 'danger'}>{result === 'PASS' ? 'Pass' : 'Fail'}</Badge> : null}
                  </span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
