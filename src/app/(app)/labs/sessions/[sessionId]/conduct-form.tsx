'use client'

import { useActionState, useState } from 'react'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { completeSessionAction } from '../../actions'

type Student = {
  studentId: string
  rollNumber: number | null
  name: string
  admissionNo: string
}
type Item = { id: string; name: string; unit: string; kind: string; quantity: number }

export function ConductForm({
  sessionId,
  students,
  items,
  suggested,
}: {
  sessionId: string
  students: Student[]
  items: Item[]
  /** Consumables from the practical's apparatus list, matched to register items. */
  suggested: { itemId: string; qty: number }[]
}) {
  const [state, action, pending] = useActionState(completeSessionAction.bind(null, sessionId), emptyFormState)
  const [rows, setRows] = useState(
    students.map((s) => ({ studentId: s.studentId, present: true, recordDone: false, marks: '' as string, remarks: '' })),
  )
  const [consumption, setConsumption] = useState(suggested)
  const [breakages, setBreakages] = useState<{ itemId: string; qty: number; studentId: string; charge: string }[]>([])
  const [notes, setNotes] = useState('')
  const consumables = items.filter((i) => i.kind === 'CONSUMABLE')
  const byId = new Map(items.map((i) => [i.id, i]))

  const payload = JSON.stringify({
    attendance: rows.map((r) => ({
      studentId: r.studentId,
      present: r.present,
      recordDone: r.recordDone,
      marks: r.marks === '' ? null : Number(r.marks),
      remarks: r.remarks || undefined,
    })),
    consumption: consumption.filter((c) => c.itemId && c.qty > 0),
    breakages: breakages
      .filter((b) => b.itemId && b.qty > 0)
      .map((b) => ({
        itemId: b.itemId,
        qty: b.qty,
        studentId: b.studentId || undefined,
        chargeMinor: b.charge ? Math.round(Number(b.charge) * 100) : undefined,
      })),
    notes: notes || undefined,
  })

  if (state.ok) return <Notice tone="success">{state.message}</Notice>

  const present = rows.filter((r) => r.present).length
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="payload" value={payload} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">
            Attendance · {present} of {rows.length} present
          </h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.map((r) => ({ ...r, present: true })))}>
            All present
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.map((r) => ({ ...r, recordDone: r.present })))}>
            All records checked
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">No students are enrolled in this class.</p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto rounded-[var(--radius-sm)] border border-line scroll-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs text-ink-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Student</th>
                  <th className="px-2 py-2 font-semibold">Present</th>
                  <th className="px-2 py-2 font-semibold">Record checked</th>
                  <th className="px-2 py-2 font-semibold">Marks</th>
                  <th className="px-3 py-2 text-left font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {students.map((s, i) => {
                  const r = rows[i]!
                  const set = (patch: Partial<typeof r>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                  return (
                    <tr key={s.studentId} className={r.present ? '' : 'bg-surface-2/60'}>
                      <td className="px-3 py-1.5 text-ink">
                        {s.rollNumber ? <span className="mr-1 text-ink-subtle">{s.rollNumber}.</span> : null}
                        {s.name}
                        <span className="ml-1 text-xs text-ink-subtle">{s.admissionNo}</span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Checkbox checked={r.present} onChange={(e) => set({ present: e.target.checked })} aria-label={`${s.name} present`} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Checkbox
                          checked={r.recordDone}
                          disabled={!r.present}
                          onChange={(e) => set({ recordDone: e.target.checked })}
                          aria-label={`${s.name} record checked`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.5"
                          value={r.marks}
                          disabled={!r.present}
                          onChange={(e) => set({ marks: e.target.value })}
                          className="mx-auto h-8 w-20 text-right"
                          aria-label={`${s.name} marks`}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input value={r.remarks} onChange={(e) => set({ remarks: e.target.value })} className="h-8" aria-label={`${s.name} remarks`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">Chemicals &amp; consumables used</h3>
        <p className="text-xs text-ink-subtle">Deducted from the register when you complete the session.</p>
        {consumption.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              value={c.itemId}
              onChange={(e) => setConsumption(consumption.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}
              className="flex-1"
              aria-label="Consumable"
            >
              <option value="">Choose…</option>
              {consumables.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} ({it.quantity} {it.unit} left)
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={0}
              step="any"
              value={c.qty}
              onChange={(e) => setConsumption(consumption.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))}
              className="w-24"
              aria-label="Quantity used"
            />
            <span className="w-14 text-xs text-ink-subtle">{byId.get(c.itemId)?.unit}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConsumption(consumption.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => setConsumption([...consumption, { itemId: '', qty: 0 }])}>
          Add consumable
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">Breakage</h3>
        {breakages.map((b, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_80px_1fr_100px_auto]">
            <Select
              value={b.itemId}
              onChange={(e) => setBreakages(breakages.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}
              aria-label="Item broken"
            >
              <option value="">Item…</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={1}
              step="any"
              value={b.qty}
              onChange={(e) => setBreakages(breakages.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))}
              aria-label="Quantity broken"
            />
            <Select
              value={b.studentId}
              onChange={(e) => setBreakages(breakages.map((x, j) => (j === i ? { ...x, studentId: e.target.value } : x)))}
              aria-label="Broken by"
            >
              <option value="">Not a student</option>
              {students.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Recover ₹"
              value={b.charge}
              onChange={(e) => setBreakages(breakages.map((x, j) => (j === i ? { ...x, charge: e.target.value } : x)))}
              aria-label="Amount to recover"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setBreakages(breakages.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => setBreakages([...breakages, { itemId: '', qty: 1, studentId: '', charge: '' }])}>
          Record breakage
        </Button>
      </section>

      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes on the session (optional)" aria-label="Session notes" />

      <Button type="submit" loading={pending}>
        Complete practical
      </Button>
    </form>
  )
}
