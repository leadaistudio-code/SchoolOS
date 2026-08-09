'use client'

import * as React from 'react'
import { Check, Paperclip, RotateCcw } from 'lucide-react'
import { reviewSubmissionAction } from '../actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatBytes } from '@/lib/format'

type Submission = {
  id: string
  studentName: string
  admissionNo: string
  status: string
  score: number | null
  note: string | null
  teacherComment: string | null
  submittedAt: Date | null
  attachments: { id: string; fileName: string; storageKey: string; sizeBytes: number }[]
}

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  REVIEWED: 'success',
  SUBMITTED: 'info',
  LATE: 'warning',
  REDO: 'danger',
  PENDING: 'neutral',
}

/**
 * Marking view.
 *
 * Score and comment stay inline per row: a teacher works down the list, and
 * opening a dialog per student would triple the number of clicks for the most
 * repetitive task in the module.
 */
export function ReviewList({
  submissions,
  maxScore,
}: {
  submissions: Submission[]
  maxScore: number | null
}) {
  const toast = useToast()
  const [drafts, setDrafts] = React.useState<Record<string, { score: string; comment: string }>>(
    () =>
      Object.fromEntries(
        submissions.map((s) => [
          s.id,
          { score: s.score !== null ? String(s.score) : '', comment: s.teacherComment ?? '' },
        ]),
      ),
  )
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  const review = (id: string, status: 'REVIEWED' | 'REDO') => {
    const draft = drafts[id]
    const scoreText = draft?.score.trim() ?? ''

    setPendingId(id)
    void reviewSubmissionAction(id, {
      status,
      score: scoreText === '' ? undefined : Number(scoreText),
      teacherComment: draft?.comment.trim() || undefined,
    }).then((r) => {
      toast.push({
        tone: r.ok ? 'success' : 'error',
        title: r.ok ? 'Saved' : 'Could not save',
        description: r.message,
      })
      setPendingId(null)
    })
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {submissions.map((s) => (
        <li key={s.id} className="px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13.5px] text-ink">{s.studentName}</p>
              <p className="text-[12px] text-ink-subtle tnum">
                {s.admissionNo}
                {s.submittedAt
                  ? ` · handed in ${new Date(s.submittedAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}`
                  : ''}
              </p>
              {s.note ? <p className="text-[12.5px] text-ink-muted mt-1">“{s.note}”</p> : null}

              {s.attachments.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {s.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={`/api/v1/files/${encodeURIComponent(a.storageKey)}`}
                        className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--brand-600)] hover:underline"
                      >
                        <Paperclip className="size-3" aria-hidden />
                        {a.fileName}
                        <span className="text-ink-subtle">{formatBytes(a.sizeBytes)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <Badge tone={TONE[s.status] ?? 'neutral'}>{s.status.toLowerCase()}</Badge>
          </div>

          <div className="flex flex-wrap items-end gap-2 mt-2.5">
            {maxScore !== null ? (
              <div>
                <label
                  className="block text-[11.5px] text-ink-subtle mb-0.5"
                  htmlFor={`score-${s.id}`}
                >
                  Score / {maxScore}
                </label>
                <Input
                  id={`score-${s.id}`}
                  type="number"
                  min={0}
                  max={maxScore}
                  className="w-24 h-8"
                  value={drafts[s.id]?.score ?? ''}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [s.id]: { ...d[s.id]!, score: e.target.value },
                    }))
                  }
                />
              </div>
            ) : null}

            <div className="flex-1 min-w-48">
              <label
                className="block text-[11.5px] text-ink-subtle mb-0.5"
                htmlFor={`comment-${s.id}`}
              >
                Comment
              </label>
              <Textarea
                id={`comment-${s.id}`}
                rows={1}
                className="min-h-8 py-1.5"
                value={drafts[s.id]?.comment ?? ''}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [s.id]: { ...d[s.id]!, comment: e.target.value },
                  }))
                }
              />
            </div>

            <Button size="sm" loading={pendingId === s.id} onClick={() => review(s.id, 'REVIEWED')}>
              <Check className="size-4" aria-hidden />
              Mark reviewed
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={pendingId === s.id}
              onClick={() => review(s.id, 'REDO')}
            >
              <RotateCcw className="size-4" aria-hidden />
              Redo
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
