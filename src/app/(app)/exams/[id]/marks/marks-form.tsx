'use client'

import { useState, useTransition } from 'react'
import { Save } from 'lucide-react'
import { saveMarksAction } from '../../actions'
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
  isAbsent: boolean
  remarks: string
}

/**
 * Marks entry.
 *
 * A keyboard-first grid: one row per student in roll order, the mark field
 * first in the tab order, and a single save at the end. Absent disables the
 * mark rather than hiding it, so the register still reads straight down.
 */
export function MarksForm({
  examId,
  examSubjectId,
  maxMarks,
  rows: initialRows,
}: {
  examId: string
  examSubjectId: string
  maxMarks: number
  rows: Row[]
}) {
  const [rows, setRows] = useState(initialRows)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const entered = rows.filter((row) => row.isAbsent || row.marksObtained !== null).length

  function update(index: number, patch: Partial<Row>) {
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
          marksObtained: row.marksObtained,
          isAbsent: row.isAbsent,
          remarks: row.remarks || null,
        })),
      )
      setMessage(result.message)
    })
  }

  return (
    <Card className="overflow-hidden">
      <TableWrap sticky>
        <Table>
          <THead sticky>
            <tr>
              <TH>Student</TH>
              <TH align="right" className="w-32">
                Mark / {maxMarks}
              </TH>
              <TH align="center" className="w-20">
                Absent
              </TH>
              <TH>Remark</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row, index) => (
              <TR key={row.studentId}>
                <TD>
                  <span className="block text-sm text-ink">
                    {row.rollNumber ? `${row.rollNumber}. ` : ''}
                    {row.name}
                  </span>
                  <span className="block text-xs text-ink-subtle tnum">{row.admissionNo}</span>
                </TD>
                <TD align="right">
                  <Input
                    aria-label={`Mark for ${row.name}`}
                    type="number"
                    min={0}
                    max={maxMarks}
                    disabled={row.isAbsent}
                    value={row.marksObtained ?? ''}
                    onChange={(event) =>
                      update(index, {
                        marksObtained: event.target.value === '' ? null : Number(event.target.value),
                      })
                    }
                    className="w-24 text-right tnum"
                  />
                </TD>
                <TD align="center">
                  <Checkbox
                    aria-label={`Mark ${row.name} absent`}
                    checked={row.isAbsent}
                    onChange={(event) =>
                      update(index, {
                        isAbsent: event.target.checked,
                        marksObtained: event.target.checked ? null : row.marksObtained,
                      })
                    }
                  />
                </TD>
                <TD>
                  <Input
                    aria-label={`Remark for ${row.name}`}
                    value={row.remarks}
                    maxLength={300}
                    onChange={(event) => update(index, { remarks: event.target.value })}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5">
        <p role="status" className="text-sm text-ink-muted">
          {message ?? `${entered} of ${rows.length} entered`}
        </p>
        <Button onClick={submit} loading={pending}>
          <Save aria-hidden />
          Save marks
        </Button>
      </div>
    </Card>
  )
}
