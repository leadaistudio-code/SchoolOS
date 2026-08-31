'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { setStudentFeeOptionsAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

export type OptionalFeeHead = {
  id: string
  code: string
  name: string
  amountMinor: number
}

export type OptionalFeeStudent = {
  id: string
  name: string
  admissionNo: string
  className: string
  sectionName: string
}

export type ClassNode = { id: string; name: string; sections: { id: string; name: string }[] }

export function OptionalFeesPanel({
  feeHeads,
  students,
  initialOptedIds,
  classes,
  currency,
  selectedFeeHeadId,
  classLevelId,
  sectionId,
}: {
  feeHeads: OptionalFeeHead[]
  students: OptionalFeeStudent[]
  initialOptedIds: string[]
  classes: ClassNode[]
  currency: string
  selectedFeeHeadId: string
  classLevelId: string
  sectionId: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [selected, setSelected] = React.useState(() => new Set(initialOptedIds))

  React.useEffect(() => {
    setSelected(new Set(initialOptedIds))
  }, [initialOptedIds, selectedFeeHeadId])

  const head = feeHeads.find((h) => h.id === selectedFeeHeadId)
  const sections = classes.find((c) => c.id === classLevelId)?.sections ?? []

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const s of students) next.add(s.id)
      return next
    })
  }

  const clearVisible = () => {
    const visible = new Set(students.map((s) => s.id))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of visible) next.delete(id)
      return next
    })
  }

  const save = () => {
    if (!selectedFeeHeadId) return
    startTransition(async () => {
      const result = await setStudentFeeOptionsAction({
        feeHeadId: selectedFeeHeadId,
        studentIds: [...selected],
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Optional fees saved', description: result.message })
      router.refresh()
    })
  }

  const navigate = (patch: Record<string, string>) => {
    const params = new URLSearchParams()
    const next = {
      feeHeadId: selectedFeeHeadId,
      classLevelId,
      sectionId,
      ...patch,
    }
    if (next.feeHeadId) params.set('feeHeadId', next.feeHeadId)
    if (next.classLevelId) params.set('classLevelId', next.classLevelId)
    if (next.sectionId) params.set('sectionId', next.sectionId)
    router.push(`/finance/optional-fees?${params.toString()}`)
  }

  if (feeHeads.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Add a fee head (e.g. Computer Science), put it on a fee structure, and mark that line as
        an optional add-on. Then return here to tick the students who opted in.
      </p>
    )
  }

  const visibleSelected = students.filter((s) => selected.has(s.id)).length

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Optional fee" htmlFor="opt-head">
          <Select
            id="opt-head"
            value={selectedFeeHeadId}
            onChange={(e) => navigate({ feeHeadId: e.target.value })}
          >
            {feeHeads.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.code}) — {formatMoney(h.amountMinor, currency)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class" htmlFor="opt-class">
          <Select
            id="opt-class"
            value={classLevelId}
            onChange={(e) => navigate({ classLevelId: e.target.value, sectionId: '' })}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Section" htmlFor="opt-section">
          <Select
            id="opt-section"
            value={sectionId}
            disabled={!classLevelId}
            onChange={(e) => navigate({ sectionId: e.target.value })}
          >
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                Section {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {head ? (
        <p className="text-sm text-ink-muted">
          Tick students taking <span className="font-medium text-ink">{head.name}</span>. When you
          generate invoices, their single invoice will include an extra{' '}
          {formatMoney(head.amountMinor, currency)} line. Others stay on the base fee only.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" type="button" onClick={selectAllVisible}>
          Select visible ({students.length})
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={clearVisible}>
          Clear visible
        </Button>
        <span className="text-xs text-ink-subtle ml-auto">
          {visibleSelected} of {students.length} visible selected · {selected.size} total opted in
        </span>
        <Button size="sm" onClick={save} loading={pending} disabled={!selectedFeeHeadId}>
          Save opt-ins
        </Button>
      </div>

      <ul className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-line overflow-hidden max-h-[28rem] overflow-y-auto scroll-thin">
        {students.length === 0 ? (
          <li className="px-4 py-6 text-sm text-ink-muted text-center">
            No active students match this filter.
          </li>
        ) : (
          students.map((s) => (
            <li key={s.id}>
              <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-2">
                <Checkbox checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink truncate">{s.name}</span>
                  <span className="block text-xs text-ink-subtle">
                    {s.admissionNo} · {s.className} · Section {s.sectionName}
                  </span>
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
