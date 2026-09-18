'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/button'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { ASSESSMENT_STATUS_LABEL, ASSESSMENT_STATUS_TONE } from '@/lib/assessments'
import { formatDay } from '@/lib/dates'

type Row = {
  id: string
  title: string
  setLabel: string | null
  totalMarks: number
  durationMinutes: number
  status: string
  createdAt: Date | string
  _count: { questions: number }
  type: { name: string }
  classSubject: {
    classLevel: { name: string }
    subject: { name: string }
  }
  section: { name: string } | null
}

export function PapersTable({
  rows,
  canDelete,
}: {
  rows: Row[]
  canDelete: boolean
}) {
  const router = useRouter()
  const { push } = useToast()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  async function remove(row: Row) {
    if (
      !window.confirm(
        `Delete question paper “${row.title}”?\n\nThis removes the paper. Questions in the bank are not deleted.`,
      )
    ) {
      return
    }
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/v1/assessments/${row.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Could not delete paper',
          description: body?.error?.message ?? 'Please try again.',
        })
        return
      }
      push({ tone: 'success', title: 'Paper deleted' })
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setBusyId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No papers yet"
        description="Build one from the syllabus and your question bank."
      />
    )
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <tr>
            <TH>Paper</TH>
            <TH>Class</TH>
            <TH>Type</TH>
            <TH align="right">Questions</TH>
            <TH align="right">Marks</TH>
            <TH align="right">Minutes</TH>
            <TH>Status</TH>
            <TH>Created</TH>
            {canDelete ? (
              <TH align="right">
                <span className="sr-only">Actions</span>
              </TH>
            ) : null}
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => {
            const locked = row.status === 'ASSIGNED' || row.status === 'CLOSED'
            return (
              <TR key={row.id}>
                <TD>
                  <Link
                    href={`/assessments/${row.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {row.title}
                  </Link>
                  {row.setLabel ? (
                    <Badge tone="neutral" className="ml-2">
                      Set {row.setLabel}
                    </Badge>
                  ) : null}
                </TD>
                <TD className="text-sm text-ink-muted">
                  {row.classSubject.classLevel.name}
                  {row.section ? `-${row.section.name}` : ''} · {row.classSubject.subject.name}
                </TD>
                <TD className="text-sm text-ink-muted">{row.type.name}</TD>
                <TD align="right" className="text-sm tnum">
                  {row._count.questions}
                </TD>
                <TD align="right" className="text-sm tnum">
                  {row.totalMarks}
                </TD>
                <TD align="right" className="text-sm tnum">
                  {row.durationMinutes}
                </TD>
                <TD>
                  <Badge tone={ASSESSMENT_STATUS_TONE[row.status] ?? 'neutral'}>
                    {ASSESSMENT_STATUS_LABEL[row.status] ?? row.status}
                  </Badge>
                </TD>
                <TD className="text-sm text-ink-muted">{formatDay(row.createdAt)}</TD>
                {canDelete ? (
                  <TD align="right">
                    <IconButton
                      label={
                        locked
                          ? 'Assigned papers cannot be deleted'
                          : 'Delete paper'
                      }
                      variant="ghost"
                      small
                      disabled={locked || busyId === row.id}
                      onClick={() => remove(row)}
                    >
                      <Trash2 />
                    </IconButton>
                  </TD>
                ) : null}
              </TR>
            )
          })}
        </TBody>
      </Table>
    </TableWrap>
  )
}
