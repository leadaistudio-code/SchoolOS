'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { QUESTION_TYPE_LABEL, type QuestionTypeKey } from '@/lib/questions'

type Row = {
  id: string
  text: string
  type: string
  marks: number
  difficulty: string
  status: string
  origin: string
  classSubject: { classLevel: { name: string }; subject: { name: string } }
  topics: { topic: { name: string } }[]
}

const DIFFICULTY_TONE = {
  EASY: 'success',
  MEDIUM: 'info',
  HARD: 'warning',
} as const

export function BankTable({
  rows,
  canDelete,
}: {
  rows: Row[]
  canDelete: boolean
}) {
  const router = useRouter()
  const { push } = useToast()
  const [selected, setSelected] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)

  const allIds = rows.map((row) => row.id)
  const allSelected = allIds.length > 0 && selected.length === allIds.length

  React.useEffect(() => {
    setSelected((current) => current.filter((id) => allIds.includes(id)))
  }, [allIds.join('|')])

  async function remove(ids: string[]) {
    if (ids.length === 0) return
    const label =
      ids.length === 1
        ? 'Delete this question from the bank?'
        : `Delete ${ids.length} questions from the bank?`
    if (!window.confirm(`${label}\n\nPapers that already use them keep their own copy.`)) return

    setBusy(true)
    try {
      const res = await fetch('/api/v1/questions/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Could not delete',
          description: body?.error?.message ?? 'Please try again.',
        })
        return
      }
      push({
        tone: 'success',
        title:
          body?.data?.deleted === 1
            ? 'Question deleted'
            : `${body?.data?.deleted ?? ids.length} questions deleted`,
      })
      setSelected([])
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {canDelete && selected.length > 0 ? (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2/80 px-4 py-2">
          <p className="text-sm text-ink">
            {selected.length} selected
          </p>
          <Button
            size="sm"
            variant="danger"
            loading={busy}
            onClick={() => remove(selected)}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete selected
          </Button>
        </div>
      ) : null}

      <TableWrap>
        <Table>
          <THead>
            <tr>
              {canDelete ? (
                <TH className="w-10">
                  <Checkbox
                    aria-label="Select all questions on this page"
                    checked={allSelected}
                    disabled={busy || rows.length === 0}
                    onChange={(event) =>
                      setSelected(event.target.checked ? allIds : [])
                    }
                  />
                </TH>
              ) : null}
              <TH>Question</TH>
              <TH>Type</TH>
              <TH>Topics</TH>
              <TH align="right">Marks</TH>
              <TH>Difficulty</TH>
              <TH>Status</TH>
              {canDelete ? (
                <TH align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              ) : null}
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                {canDelete ? (
                  <TD>
                    <Checkbox
                      aria-label="Select question"
                      checked={selected.includes(row.id)}
                      disabled={busy}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, row.id]
                            : current.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </TD>
                ) : null}
                <TD className="max-w-md">
                  <Link
                    href={`/assessments/bank/${row.id}`}
                    className="text-sm text-ink hover:underline"
                  >
                    {row.text.length > 120 ? `${row.text.slice(0, 120)}…` : row.text}
                  </Link>
                  <div className="mt-0.5 text-xs text-ink-subtle">
                    {row.classSubject.classLevel.name} · {row.classSubject.subject.name}
                    {row.origin === 'AI' ? ' · generated' : ''}
                  </div>
                </TD>
                <TD className="text-sm text-ink-muted">
                  {QUESTION_TYPE_LABEL[row.type as QuestionTypeKey] ?? row.type}
                </TD>
                <TD className="text-xs text-ink-muted">
                  {row.topics.length === 0
                    ? '—'
                    : row.topics.map((t) => t.topic.name).join(', ')}
                </TD>
                <TD align="right" className="text-sm tnum">
                  {row.marks}
                </TD>
                <TD>
                  <Badge tone={DIFFICULTY_TONE[row.difficulty as keyof typeof DIFFICULTY_TONE]}>
                    {row.difficulty.toLowerCase()}
                  </Badge>
                </TD>
                <TD>
                  <Badge tone={row.status === 'APPROVED' ? 'success' : 'neutral'}>
                    {row.status.toLowerCase()}
                  </Badge>
                </TD>
                {canDelete ? (
                  <TD align="right">
                    <IconButton
                      label="Delete question"
                      variant="ghost"
                      small
                      disabled={busy}
                      onClick={() => remove([row.id])}
                    >
                      <Trash2 />
                    </IconButton>
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  )
}
