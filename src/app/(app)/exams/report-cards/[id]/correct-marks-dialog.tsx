'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PencilLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { correctResultMarksAction } from '../../actions'

type Paper = {
  examSubjectId: string
  subject: string
  maxMarks: number
  passMarks: number
  writtenMax: number
  internalMaxMarks: number | null
  oralMaxMarks: number | null
  hasParts: boolean
  total: number | null
  written: number | null
  internal: number | null
  oral: number | null
  isAbsent: boolean
  entered: boolean
  elective: boolean
}

type Row = { total: string; written: string; internal: string; oral: string; isAbsent: boolean }

const EMPTY: Row = { total: '', written: '', internal: '', oral: '', isAbsent: false }
const text = (value: number | null) => (value === null ? '' : String(value))
const num = (value: string) => (value.trim() === '' ? null : Number(value))

/**
 * Corrects marks straight from a report card. The result, grade and class
 * ranks are recalculated on save; a reason is required because published
 * report cards are already with parents.
 */
export function CorrectMarksDialog({ resultId, published, papers }: { resultId: string; published: boolean; papers: Paper[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [reason, setReason] = useState('')
  const initial = () =>
    Object.fromEntries(
      papers.map((p) => [
        p.examSubjectId,
        {
          total: text(p.total),
          written: text(p.written),
          internal: text(p.internal),
          oral: text(p.oral),
          isAbsent: p.isAbsent,
        },
      ]),
    ) as Record<string, Row>
  const [rows, setRows] = useState<Record<string, Row>>(initial)

  const set = (id: string, patch: Partial<Row>) => setRows((current) => ({ ...current, [id]: { ...(current[id] ?? EMPTY), ...patch } }))
  const openDialog = () => {
    setRows(initial())
    setReason('')
    setOpen(true)
  }

  /** Papers stored as a plain total (e.g. CSV) are edited as a total until parts are typed in. */
  const usesParts = (p: Paper, row: Row) => p.hasParts && (row.written !== '' || row.internal !== '' || row.oral !== '' || p.total === null)

  const save = () =>
    start(async () => {
      const payload = papers.map((p) => {
        const row = rows[p.examSubjectId] ?? EMPTY
        if (row.isAbsent) return { examSubjectId: p.examSubjectId, marksObtained: null, isAbsent: true }
        if (usesParts(p, row)) {
          return {
            examSubjectId: p.examSubjectId,
            marksObtained: null,
            writtenMarks: num(row.written),
            internalMarks: p.internalMaxMarks ? num(row.internal) : undefined,
            oralMarks: p.oralMaxMarks ? num(row.oral) : undefined,
            isAbsent: false,
          }
        }
        return { examSubjectId: p.examSubjectId, marksObtained: num(row.total), isAbsent: false }
      })
      const result = await correctResultMarksAction({ resultId, reason, rows: payload })
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.ok ? 'Report card updated' : 'Not saved', description: result.message })
      if (result.ok) {
        setOpen(false)
        router.refresh()
      }
    })

  const cell = 'h-8 w-20 text-right tnum'
  return (
    <>
      <Button variant="secondary" onClick={openDialog}>
        <PencilLine aria-hidden />
        Edit marks
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Edit marks on this report card"
        description={
          published
            ? 'This report card is published. Saving updates the marks, total, grade and class ranks straight away, and the change is recorded in the audit trail.'
            : 'Saving updates the marks, total, grade and class ranks, and the change is recorded in the audit trail.'
        }
        footer={
          <>
            <Button loading={pending} disabled={reason.trim().length < 5} onClick={save}>Save corrections</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-subtle">
                <th className="px-1 py-1.5 font-medium">Subject</th>
                <th className="px-1 py-1.5 font-medium">Marks</th>
                <th className="px-1 py-1.5 text-center font-medium">Absent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {papers.map((p) => {
                const row = rows[p.examSubjectId] ?? EMPTY
                const parts = usesParts(p, row)
                return (
                  <tr key={p.examSubjectId}>
                    <td className="px-1 py-2 align-top">
                      <span className="block font-medium text-ink">{p.subject}</span>
                      <span className="block text-xs text-ink-subtle">
                        Out of {p.maxMarks} · pass {p.passMarks}
                        {!p.entered ? (p.elective ? ' · elective, leave blank if not taken' : ' · not entered yet') : ''}
                      </span>
                    </td>
                    <td className="px-1 py-2">
                      {row.isAbsent ? (
                        <span className="text-xs text-ink-subtle">Absent</span>
                      ) : parts ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1 text-xs text-ink-muted">
                            Written
                            <Input aria-label={`${p.subject} written`} type="number" inputMode="decimal" min={0} max={p.writtenMax} step="0.5" className={cell} value={row.written} onChange={(e) => set(p.examSubjectId, { written: e.target.value })} />
                            <span className="tnum">/{p.writtenMax}</span>
                          </label>
                          {p.internalMaxMarks ? (
                            <label className="flex items-center gap-1 text-xs text-ink-muted">
                              Internal
                              <Input aria-label={`${p.subject} internal`} type="number" inputMode="decimal" min={0} max={p.internalMaxMarks} step="0.5" className={cell} value={row.internal} onChange={(e) => set(p.examSubjectId, { internal: e.target.value })} />
                              <span className="tnum">/{p.internalMaxMarks}</span>
                            </label>
                          ) : null}
                          {p.oralMaxMarks ? (
                            <label className="flex items-center gap-1 text-xs text-ink-muted">
                              Oral
                              <Input aria-label={`${p.subject} oral`} type="number" inputMode="decimal" min={0} max={p.oralMaxMarks} step="0.5" className={cell} value={row.oral} onChange={(e) => set(p.examSubjectId, { oral: e.target.value })} />
                              <span className="tnum">/{p.oralMaxMarks}</span>
                            </label>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-ink-muted">
                          <Input aria-label={`${p.subject} marks`} type="number" inputMode="decimal" min={0} max={p.maxMarks} step="0.5" className={cell} value={row.total} onChange={(e) => set(p.examSubjectId, { total: e.target.value })} />
                          <span className="tnum">/{p.maxMarks}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input type="checkbox" aria-label={`${p.subject} absent`} className="size-4 accent-[var(--brand-600)]" checked={row.isAbsent} onChange={(e) => set(p.examSubjectId, { isAbsent: e.target.checked })} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Field label="Reason for the correction" htmlFor={`correct-${resultId}`} required className="mt-4">
          <Textarea id={`correct-${resultId}`} rows={2} maxLength={300} value={reason} placeholder="e.g. Totalling error found during re-check" onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>
    </>
  )
}
