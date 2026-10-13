'use client'

import { useState, useTransition } from 'react'
import { Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { saveMarksAction } from '../../actions'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Input } from '@/components/ui/input'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

type Row = {
  studentId: string
  rollNumber: number | null
  admissionNo: string
  name: string
  marksObtained: number | null
  internalMarks?: number | null
  oralMarks?: number | null
  isAbsent: boolean
  notApplicable?: boolean
  remarks: string
}

type EditRow = Row & { written: number | null; internal: number | null; oral: number | null }

const round = (n: number) => Math.round(n * 100) / 100
const numOrNull = (value: string) => (value === '' ? null : Number(value))

/**
 * Marks entry.
 *
 * A keyboard-first grid: one row per student in roll order, the mark field
 * first in the tab order, and a single save at the end. Absent disables the
 * mark rather than hiding it, so the register still reads straight down.
 * Papers with internal / oral parts get one field per part and a live total.
 */
export function MarksForm({
  examId,
  examSubjectId,
  maxMarks,
  internalMaxMarks = null,
  oralMaxMarks = null,
  rows: initialRows,
  readOnly = false,
}: {
  examId: string
  examSubjectId: string
  maxMarks: number
  internalMaxMarks?: number | null
  oralMaxMarks?: number | null
  rows: Row[]
  readOnly?: boolean
}) {
  const hasParts = Boolean(internalMaxMarks || oralMaxMarks)
  const writtenMax = round(maxMarks - (internalMaxMarks ?? 0) - (oralMaxMarks ?? 0))
  const [rows, setRows] = useState<EditRow[]>(() =>
    initialRows.map((row) => {
      const internal = row.internalMarks ?? null
      const oral = row.oralMarks ?? null
      const written = row.marksObtained === null ? null : round(row.marksObtained - (internal ?? 0) - (oral ?? 0))
      return { ...row, written, internal, oral }
    }),
  )
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  const totalOf = (row: EditRow) => {
    if (!hasParts) return row.marksObtained
    const parts = [row.written, internalMaxMarks ? row.internal : null, oralMaxMarks ? row.oral : null].filter((v): v is number => v !== null)
    return parts.length ? round(parts.reduce((a, b) => a + b, 0)) : null
  }
  const entered = rows.filter((row) => row.isAbsent || row.notApplicable || totalOf(row) !== null).length
  const notApplicableCount = rows.filter((row) => row.notApplicable).length

  function update(index: number, patch: Partial<EditRow>) {
    setRows((current) =>
      current.map((row, currentIndex) => (currentIndex === index ? { ...row, ...patch } : row)),
    )
  }

  function submit() {
    startTransition(async () => {
      const result = await saveMarksAction(
        examId,
        examSubjectId,
        rows.map((row) => ({
          studentId: row.studentId,
          marksObtained: totalOf(row),
          ...(hasParts
            ? {
                writtenMarks: row.written,
                internalMarks: internalMaxMarks ? row.internal : null,
                oralMarks: oralMaxMarks ? row.oral : null,
              }
            : {}),
          isAbsent: row.isAbsent,
          notApplicable: Boolean(row.notApplicable),
          remarks: row.remarks || null,
        })),
      )
      setMessage({ ok: result.ok, text: result.message })
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.ok ? 'Marks saved' : 'Marks not saved', description: result.message })
      if (result.ok) router.refresh()
    })
  }

  const markInput = (row: EditRow, index: number, field: 'written' | 'internal' | 'oral' | 'marksObtained', max: number, label: string) => (
    <Input
      aria-label={`${label} for ${row.name}`}
      type="number"
      min={0}
      max={max}
      step="0.5"
      disabled={readOnly || row.isAbsent || row.notApplicable}
      value={row[field] ?? ''}
      onChange={(event) => update(index, { [field]: numOrNull(event.target.value) })}
      className="w-20 text-right tnum"
    />
  )

  return (
    <Card className="overflow-hidden">
      <TableWrap sticky>
        <Table>
          <THead sticky>
            <tr>
              <TH>Student</TH>
              {hasParts ? (
                <>
                  <TH align="right" className="w-28">Written / {writtenMax}</TH>
                  {internalMaxMarks ? <TH align="right" className="w-28">Internal / {internalMaxMarks}</TH> : null}
                  {oralMaxMarks ? <TH align="right" className="w-28">Oral / {oralMaxMarks}</TH> : null}
                  <TH align="right" className="w-24">Total / {maxMarks}</TH>
                </>
              ) : (
                <TH align="right" className="w-32">Mark / {maxMarks}</TH>
              )}
              <TH align="center" className="w-20">Absent</TH>
              <TH align="center" className="w-24" title="Student has not opted for this subject; it is left out of their result">Not applicable</TH>
              <TH>Remark</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row, index) => {
              const total = totalOf(row)
              return (
                <TR key={row.studentId}>
                  <TD>
                    <span className="block text-sm text-ink">
                      {row.rollNumber ? `${row.rollNumber}. ` : ''}
                      {row.name}
                    </span>
                    <span className="block text-xs text-ink-subtle tnum">{row.admissionNo}</span>
                  </TD>
                  {hasParts ? (
                    <>
                      <TD align="right">{markInput(row, index, 'written', writtenMax, 'Written marks')}</TD>
                      {internalMaxMarks ? <TD align="right">{markInput(row, index, 'internal', internalMaxMarks, 'Internal marks')}</TD> : null}
                      {oralMaxMarks ? <TD align="right">{markInput(row, index, 'oral', oralMaxMarks, 'Oral marks')}</TD> : null}
                      <TD align="right" className={`font-semibold tnum ${total !== null && total > maxMarks ? 'text-[var(--danger)]' : 'text-ink'}`}>
                        {row.notApplicable ? 'N/A' : row.isAbsent ? 'AB' : total ?? '—'}
                      </TD>
                    </>
                  ) : (
                    <TD align="right">{markInput(row, index, 'marksObtained', maxMarks, 'Mark')}</TD>
                  )}
                  <TD align="center">
                    <Checkbox
                      aria-label={`Mark ${row.name} absent`}
                      checked={row.isAbsent}
                      disabled={readOnly}
                      onChange={(event) =>
                        update(index, {
                          isAbsent: event.target.checked,
                          ...(event.target.checked ? { notApplicable: false, marksObtained: null, written: null, internal: null, oral: null } : {}),
                        })
                      }
                    />
                  </TD>
                  <TD align="center">
                    <Checkbox
                      aria-label={`${row.name} has not opted for this subject`}
                      checked={Boolean(row.notApplicable)}
                      disabled={readOnly}
                      onChange={(event) =>
                        update(index, {
                          notApplicable: event.target.checked,
                          ...(event.target.checked ? { isAbsent: false, marksObtained: null, written: null, internal: null, oral: null } : {}),
                        })
                      }
                    />
                  </TD>
                  <TD>
                    <Input
                      aria-label={`Remark for ${row.name}`}
                      value={row.remarks}
                      disabled={readOnly}
                      maxLength={300}
                      onChange={(event) => update(index, { remarks: event.target.value })}
                    />
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </TableWrap>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5">
        <p
          role="status"
          className={`text-sm ${message && !message.ok ? 'font-medium text-[var(--danger)]' : 'text-ink-muted'}`}
        >
          {message ? `${message.text} ` : ''}
          {!message || message.ok
            ? `${entered} of ${rows.length} entered${notApplicableCount ? ` (${notApplicableCount} not applicable)` : ''}`
            : null}
        </p>
        <Button onClick={submit} loading={pending} disabled={readOnly}>
          <Save aria-hidden />
          Save marks
        </Button>
      </div>
    </Card>
  )
}
