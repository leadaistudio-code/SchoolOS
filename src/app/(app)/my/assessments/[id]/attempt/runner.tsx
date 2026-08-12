'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { OPTION_TYPES, QUESTION_TYPE_LABEL, type QuestionTypeKey } from '@/lib/questions'

type Option = { index: number; text: string; matchWith: string | null }
type Question = {
  id: string
  marks: number
  text: string
  type: string
  options: Option[]
  answer: { responseText: string | null; selectedIndexes: unknown } | null
}
type Section = { id: string; title: string; instructions: string | null; questions: Question[] }

export type Paper = {
  attemptId: string
  status: string
  title: string
  subject: string
  instructions: string | null
  totalMarks: number
  mode: string
  startedAt: string | Date
  endsAt: string | Date
  timed: boolean
  onePerScreen: boolean
  allowBack: boolean
  autoSubmit: boolean
  sections: Section[]
}

type Answer = { responseText: string; selectedIndexes: number[] }

/**
 * The test runner.
 *
 * Three things it has to get right, in order of how badly they hurt:
 *
 *   Nothing is lost. Every change is saved to the server on a short debounce,
 *   and the save state is on screen. A phone that dies mid-paper costs the last
 *   few seconds, not the hour.
 *
 *   The clock is honest. The countdown here is a display of a deadline the
 *   server already holds and enforces; reloading the page, or changing the
 *   device clock, does not extend it.
 *
 *   Submitting is deliberate. It confirms, and it says how many questions are
 *   unanswered — the one fact a student would want before ending the paper.
 */
export function AttemptRunner({ paper }: { paper: Paper }) {
  const router = useRouter()
  const { push } = useToast()

  const questions = React.useMemo(
    () => paper.sections.flatMap((section) => section.questions.map((q) => ({ ...q, section }))),
    [paper.sections],
  )

  const [answers, setAnswers] = React.useState<Record<string, Answer>>(() => {
    const initial: Record<string, Answer> = {}
    for (const question of questions) {
      initial[question.id] = {
        responseText: question.answer?.responseText ?? '',
        selectedIndexes: Array.isArray(question.answer?.selectedIndexes)
          ? (question.answer.selectedIndexes as number[])
          : [],
      }
    }
    return initial
  })

  const [cursor, setCursor] = React.useState(0)
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [submitting, setSubmitting] = React.useState(false)
  const [remaining, setRemaining] = React.useState(() =>
    Math.max(0, Math.floor((new Date(paper.endsAt).getTime() - Date.now()) / 1000)),
  )

  const submitted = React.useRef(false)
  const pending = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const submit = React.useCallback(
    async (auto: boolean) => {
      if (submitted.current) return
      submitted.current = true
      setSubmitting(true)
      try {
        const res = await fetch(`/api/v1/my/attempts/${paper.attemptId}/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ auto }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          submitted.current = false
          push({
            tone: 'error',
            title: 'Not submitted',
            description: body?.error?.message ?? 'Please try again.',
          })
          return
        }
        push({
          tone: 'success',
          title: auto ? 'Time up — paper submitted' : 'Paper submitted',
          description: body?.data?.released
            ? `You scored ${body.data.objectiveScore} of ${paper.totalMarks}.`
            : 'Your teacher will release the result.',
        })
        router.push('/my/assessments')
        router.refresh()
      } finally {
        setSubmitting(false)
      }
    },
    [paper.attemptId, paper.totalMarks, push, router],
  )

  // The countdown is a display. The deadline it counts to is the server's, and
  // the server rejects a save after it regardless of what this shows.
  React.useEffect(() => {
    if (!paper.timed) return
    const timer = setInterval(() => {
      const left = Math.max(0, Math.floor((new Date(paper.endsAt).getTime() - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0 && paper.autoSubmit) void submit(true)
    }, 1000)
    return () => clearInterval(timer)
  }, [paper.endsAt, paper.timed, paper.autoSubmit, submit])

  React.useEffect(() => {
    const timers = pending.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
    }
  }, [])

  function persist(questionId: string, next: Answer) {
    const existing = pending.current.get(questionId)
    if (existing) clearTimeout(existing)

    setSaving('saving')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/my/attempts/${paper.attemptId}/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            assessmentQuestionId: questionId,
            responseText: next.responseText || null,
            selectedIndexes: next.selectedIndexes,
          }),
        })
        setSaving(res.ok ? 'saved' : 'error')
      } catch {
        setSaving('error')
      } finally {
        pending.current.delete(questionId)
      }
    }, 700)

    pending.current.set(questionId, timer)
  }

  function update(questionId: string, patch: Partial<Answer>) {
    setAnswers((prev) => {
      const next = { ...prev[questionId]!, ...patch }
      persist(questionId, next)
      return { ...prev, [questionId]: next }
    })
  }

  const answered = questions.filter((question) => {
    const answer = answers[question.id]
    return Boolean(answer?.responseText.trim() || answer?.selectedIndexes.length)
  }).length

  const visible = paper.onePerScreen ? questions.slice(cursor, cursor + 1) : questions

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const urgent = paper.timed && remaining <= 300

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-line bg-surface px-4 py-3 sm:mx-0 sm:rounded-[var(--radius)] sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-ink">{paper.title}</p>
            <p className="text-sm text-ink-muted">
              {paper.subject} · {paper.totalMarks} marks · {answered} of {questions.length} answered
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={
                saving === 'error'
                  ? 'text-sm text-danger'
                  : 'text-sm text-ink-subtle'
              }
            >
              {saving === 'saving'
                ? 'Saving…'
                : saving === 'saved'
                  ? 'Saved'
                  : saving === 'error'
                    ? 'Not saved — check your connection'
                    : ''}
            </span>

            {paper.timed && (
              <Badge tone={urgent ? 'warning' : 'neutral'}>
                {minutes}:{String(seconds).padStart(2, '0')} left
              </Badge>
            )}
          </div>
        </div>
      </div>

      {paper.instructions && (
        <Notice tone="info" title="Instructions">
          {paper.instructions}
        </Notice>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {visible.map((question) => {
          const number = questions.indexOf(question) + 1
          const answer = answers[question.id]!
          const usesOptions = OPTION_TYPES.includes(question.type as QuestionTypeKey)

          return (
            <Card key={question.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-ink">
                    <span className="font-medium tnum">{number}. </span>
                    <span className="whitespace-pre-wrap">{question.text}</span>
                  </p>
                  <span className="whitespace-nowrap text-sm tnum text-ink-subtle">
                    {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
                  </span>
                </div>

                <p className="mt-1 text-xs text-ink-subtle">
                  {QUESTION_TYPE_LABEL[question.type as QuestionTypeKey] ?? question.type}
                </p>

                {usesOptions ? (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {question.options.map((option) => {
                      const chosen = answer.selectedIndexes.includes(option.index)
                      return (
                        <li key={option.index}>
                          <button
                            type="button"
                            aria-pressed={chosen}
                            onClick={() =>
                              update(question.id, {
                                selectedIndexes: chosen
                                  ? answer.selectedIndexes.filter((i) => i !== option.index)
                                  : [option.index],
                              })
                            }
                            className={
                              chosen
                                ? 'w-full rounded-[var(--radius-sm)] border border-[var(--brand-500)] bg-[var(--brand-50)] p-3 text-left text-sm text-ink'
                                : 'w-full rounded-[var(--radius-sm)] border border-line bg-surface p-3 text-left text-sm text-ink hover:bg-surface-2'
                            }
                          >
                            {option.text}
                            {option.matchWith && (
                              <span className="text-ink-muted"> — {option.matchWith}</span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : question.marks <= 1 ? (
                  <Input
                    className="mt-3"
                    value={answer.responseText}
                    aria-label={`Answer to question ${number}`}
                    onChange={(event) => update(question.id, { responseText: event.target.value })}
                  />
                ) : (
                  <Textarea
                    className="mt-3"
                    rows={question.marks >= 5 ? 8 : 4}
                    value={answer.responseText}
                    aria-label={`Answer to question ${number}`}
                    onChange={(event) => update(question.id, { responseText: event.target.value })}
                  />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          {paper.onePerScreen ? (
            <div className="flex items-center gap-2">
              {paper.allowBack && (
                <Button
                  variant="secondary"
                  disabled={cursor === 0}
                  onClick={() => setCursor((prev) => Math.max(0, prev - 1))}
                >
                  Previous
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={cursor >= questions.length - 1}
                onClick={() => setCursor((prev) => Math.min(questions.length - 1, prev + 1))}
              >
                Next
              </Button>
              <span className="text-sm text-ink-subtle tnum">
                {cursor + 1} / {questions.length}
              </span>
            </div>
          ) : (
            <span className="text-sm text-ink-subtle">
              {questions.length - answered} unanswered
            </span>
          )}

          <Button
            disabled={submitting}
            onClick={() => {
              const left = questions.length - answered
              const message =
                left > 0
                  ? `You have ${left} unanswered ${left === 1 ? 'question' : 'questions'}. Submit anyway?`
                  : 'Submit your paper?'
              if (!window.confirm(message)) return
              void submit(false)
            }}
          >
            {submitting ? 'Submitting…' : 'Submit paper'}
          </Button>
        </div>
      </div>
    </div>
  )
}
