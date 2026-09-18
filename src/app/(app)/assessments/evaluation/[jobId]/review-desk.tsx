'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type Answer = {
  id: string
  questionNumber: number | null
  assessmentQuestionId: string | null
  extractedText: string | null
  ocrConfidence: number | null
  evaluationConfidence: number | null
  suggestedMarks: number | null
  maxMarks: number | null
  feedback: string | null
  needsReview: boolean
  reviewStatus: string
  teacherMarks: number | null
  teacherFeedback: string | null
  rubricNotes: unknown
}

type PaperQuestion = {
  id: string
  position: number
  marks: number
  textSnapshot: string
  answerSnapshot: string | null
  typeSnapshot: string
}

export function EvaluationReviewDesk({
  jobId,
  status,
  sheetId,
  mimeType,
  fileName,
  answers: initialAnswers,
  paperQuestions,
  canRetry,
}: {
  jobId: string
  status: string
  sheetId: string
  mimeType: string
  fileName: string
  answers: Answer[]
  paperQuestions: PaperQuestion[]
  canRetry: boolean
}) {
  const router = useRouter()
  const { push } = useToast()
  const [index, setIndex] = React.useState(0)
  const [answers, setAnswers] = React.useState(initialAnswers)
  const [busy, setBusy] = React.useState(false)
  const [teacherMarks, setTeacherMarks] = React.useState('')
  const [teacherFeedback, setTeacherFeedback] = React.useState('')

  const current = answers[index]
  const paperQ =
    paperQuestions.find((q) => q.id === current?.assessmentQuestionId) ??
    paperQuestions[index] ??
    null

  React.useEffect(() => {
    if (!current) return
    setTeacherMarks(
      current.teacherMarks != null
        ? String(current.teacherMarks)
        : current.suggestedMarks != null
          ? String(current.suggestedMarks)
          : '',
    )
    setTeacherFeedback(current.teacherFeedback ?? '')
  }, [current])

  async function review(reviewStatus: 'APPROVED' | 'OVERRIDDEN' | 'FLAGGED') {
    if (!current) return
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/evaluation/answers/${current.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reviewStatus,
          teacherMarks:
            reviewStatus === 'OVERRIDDEN' || teacherMarks
              ? Number(teacherMarks)
              : undefined,
          teacherFeedback: teacherFeedback.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Could not save review',
          description: body?.error?.message ?? 'Please try again.',
        })
        return
      }
      setAnswers((prev) =>
        prev.map((a) => (a.id === current.id ? { ...a, ...body.data } : a)),
      )
      push({ tone: 'success', title: `Marked as ${reviewStatus.toLowerCase()}` })
      if (index < answers.length - 1) setIndex((i) => i + 1)
      else router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error' })
    } finally {
      setBusy(false)
    }
  }

  async function retry() {
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/evaluation/jobs/${jobId}/retry`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Retry failed',
          description: body?.error?.message ?? 'Please try again.',
        })
        return
      }
      push({ tone: 'success', title: 'Re-queued', description: 'Refresh after the worker runs.' })
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error' })
    } finally {
      setBusy(false)
    }
  }

  async function finalise() {
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/evaluation/jobs/${jobId}/finalise`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Could not finalise',
          description: body?.error?.message ?? 'Approve every answer first.',
        })
        return
      }
      push({
        tone: 'success',
        title: 'Attempt evaluated',
        description: `Total ${body.data.totalScore}. Publish from the classic evaluate screen when ready.`,
      })
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error' })
    } finally {
      setBusy(false)
    }
  }

  const fileUrl = `/api/v1/evaluation/sheets/${sheetId}/file`
  const isImage = mimeType.startsWith('image/')
  const isPdf = mimeType === 'application/pdf'
  const rubric =
    current?.rubricNotes && typeof current.rubricNotes === 'object'
      ? (current.rubricNotes as { expectedAnswer?: string | null; questionPreview?: string })
      : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted)]">
          Job status: <span className="font-medium text-[var(--fg)]">{status.replaceAll('_', ' ')}</span>
          {answers.length > 0 ? ` · Question ${index + 1} of ${answers.length}` : null}
        </p>
        {canRetry ? (
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={retry}>
            Retry evaluation
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || status === 'COMPLETED'}
          onClick={finalise}
        >
          {status === 'COMPLETED' ? 'Attempt finalised' : 'Finalise attempt'}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Answer sheet</CardTitle>
          </CardHeader>
          <CardContent>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fileUrl}
                alt={fileName}
                className="max-h-[70vh] w-full rounded-[8px] border border-[var(--border)] object-contain bg-[var(--surface-2)]"
              />
            ) : isPdf ? (
              <iframe
                title={fileName}
                src={fileUrl}
                className="h-[70vh] w-full rounded-[8px] border border-[var(--border)]"
              />
            ) : (
              <a href={fileUrl} className="text-sm text-[var(--brand-600)] underline">
                Download {fileName}
              </a>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI evaluation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!current ? (
              <p className="text-sm text-[var(--muted)]">
                No evaluated answers yet. If the job is queued, wait for the worker or retry.
              </p>
            ) : (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Question</p>
                  <p className="mt-1 text-sm text-[var(--fg)]">
                    {paperQ?.textSnapshot ?? rubric?.questionPreview ?? '—'}
                  </p>
                  {paperQ ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {paperQ.typeSnapshot} · {paperQ.marks} marks
                    </p>
                  ) : null}
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Expected answer
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--fg)]">
                    {paperQ?.answerSnapshot ?? rubric?.expectedAnswer ?? '—'}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Extracted / AI notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--fg)]">
                    {current.extractedText ?? current.feedback ?? '—'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    OCR {current.ocrConfidence != null ? `${Math.round(current.ocrConfidence)}%` : 'n/a'}
                    {' · '}
                    Eval{' '}
                    {current.evaluationConfidence != null
                      ? `${Math.round(current.evaluationConfidence)}%`
                      : 'n/a'}
                    {current.needsReview ? ' · Needs review' : ''}
                  </p>
                </div>

                <div
                  className={cn(
                    'rounded-[8px] px-3 py-2 text-xs font-medium',
                    current.reviewStatus === 'APPROVED'
                      ? 'bg-emerald-50 text-emerald-800'
                      : current.reviewStatus === 'OVERRIDDEN'
                        ? 'bg-amber-50 text-amber-900'
                        : current.reviewStatus === 'FLAGGED'
                          ? 'bg-red-50 text-red-800'
                          : 'bg-[var(--surface-2)] text-[var(--muted)]',
                  )}
                >
                  Review status: {current.reviewStatus}
                  {current.suggestedMarks != null
                    ? ` · AI suggested ${current.suggestedMarks}/${current.maxMarks ?? '?'}`
                    : ''}
                </div>

                <Field label="Marks">
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={teacherMarks}
                    onChange={(e) => setTeacherMarks(e.target.value)}
                    max={current.maxMarks ?? 100}
                  />
                </Field>
                <Field label="Feedback">
                  <Textarea
                    rows={3}
                    value={teacherFeedback}
                    onChange={(e) => setTeacherFeedback(e.target.value)}
                  />
                </Field>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => review('APPROVED')}>
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || teacherMarks === ''}
                    onClick={() => review('OVERRIDDEN')}
                  >
                    Change marks
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => review('FLAGGED')}
                  >
                    Flag
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || index >= answers.length - 1}
                    onClick={() => setIndex((i) => i + 1)}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
