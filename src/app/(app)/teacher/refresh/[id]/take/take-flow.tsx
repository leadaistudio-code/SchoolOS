'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Check, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { Progress } from '@/components/ui/progress'
import { buttonVariants } from '@/components/ui/button-variants'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type Question = {
  refreshQuestionId: string
  position: number
  text: string
  type: string
  options: { index: number; text: string }[]
}

type Refresher = {
  id: string
  subjectLabel: string
  className: string
  attemptsUsed: number
  maxAttempts: number
  questions: Question[]
}

type Result = {
  percent: number
  correctCount: number
  readiness: { level: string; label: string; headline: string }
  canRetake: boolean
  strengths: string[]
  toRefresh: string[]
  note: string
  generatedByAi: boolean
}

/** Readiness tone, calm by design — the lowest band is neutral, never danger-red. */
function readinessTone(level: string): 'success' | 'warning' | 'brand' {
  if (level === 'READY') return 'success'
  if (level === 'REFRESH_RECOMMENDED' || level === 'ADDITIONAL_REVIEW') return 'warning'
  return 'brand'
}
function readinessBadgeTone(level: string): BadgeTone {
  if (level === 'READY') return 'success'
  if (level === 'GOOD') return 'info'
  if (level === 'REFRESH_RECOMMENDED') return 'warning'
  return 'neutral'
}

/**
 * Taking a refresher, one question at a time.
 *
 * Built for a phone held between lessons: a single question fills the screen, a
 * progress bar shows how far in you are, and answers are saved to the device as
 * you go — close the tab and the next visit picks up where you left off. Nothing
 * is submitted until you choose to; the result that follows is written to teach,
 * not to grade, so it leads with what you're ready on before what to brush up.
 */
export function TakeFlow({ refresher }: { refresher: Refresher }) {
  const router = useRouter()
  const { push } = useToast()
  const total = refresher.questions.length

  const A_KEY = `tkr:v1:${refresher.id}:answers`
  const I_KEY = `tkr:v1:${refresher.id}:index`

  const [answers, setAnswers] = React.useState<Record<string, number[]>>({})
  const [index, setIndex] = React.useState(0)
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<Result | null>(null)
  const [attemptsUsed, setAttemptsUsed] = React.useState(refresher.attemptsUsed)

  // Resume from the device once, on mount. Reads are best-effort — a cleared or
  // unavailable store just starts a fresh run.
  React.useEffect(() => {
    try {
      const rawA = localStorage.getItem(A_KEY)
      const rawI = localStorage.getItem(I_KEY)
      if (rawA) setAnswers(JSON.parse(rawA))
      if (rawI) {
        const n = Number.parseInt(rawI, 10)
        if (Number.isInteger(n) && n >= 0 && n < total) setIndex(n)
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist imperatively on every change, so we never race the mount hydration.
  function persist(nextAnswers: Record<string, number[]>, nextIndex: number) {
    try {
      localStorage.setItem(A_KEY, JSON.stringify(nextAnswers))
      localStorage.setItem(I_KEY, String(nextIndex))
    } catch {
      /* ignore */
    }
  }
  function clearSaved() {
    try {
      localStorage.removeItem(A_KEY)
      localStorage.removeItem(I_KEY)
    } catch {
      /* ignore */
    }
  }

  const question = refresher.questions[index]
  const answeredCount = refresher.questions.filter(
    (q) => (answers[q.refreshQuestionId]?.length ?? 0) > 0,
  ).length
  const unanswered = total - answeredCount

  function toggleOption(qid: string, optionIndex: number) {
    setAnswers((prev) => {
      const current = prev[qid] ?? []
      const next = current.includes(optionIndex)
        ? current.filter((i) => i !== optionIndex)
        : [...current, optionIndex]
      const merged = { ...prev, [qid]: next }
      persist(merged, index)
      return merged
    })
  }

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(total - 1, next))
    setIndex(clamped)
    persist(answers, clamped)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/teacher-refresh/${refresher.id}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          answers: refresher.questions.map((q) => ({
            refreshQuestionId: q.refreshQuestionId,
            selectedIndexes: answers[q.refreshQuestionId] ?? [],
          })),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Could not submit',
          description: body?.error?.message ?? 'Please try again in a moment.',
        })
        return
      }
      clearSaved()
      const data = body.data as Result & { attemptsUsed: number }
      setAttemptsUsed(data.attemptsUsed)
      setResult(data)
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  function retake() {
    setResult(null)
    setAnswers({})
    setIndex(0)
    clearSaved()
    router.refresh()
  }

  // ---- Result screen -------------------------------------------------------
  if (result) {
    return (
      <ResultScreen
        result={result}
        total={total}
        attemptsUsed={attemptsUsed}
        maxAttempts={refresher.maxAttempts}
        onRetake={retake}
      />
    )
  }

  // ---- Empty guard ---------------------------------------------------------
  if (!question) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-ink-muted">This refresher has no questions to show.</p>
          <div className="mt-4">
            <Link
              href="/teacher/refresh"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Back to my refreshers
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  const selected = answers[question.refreshQuestionId] ?? []
  const isLast = index === total - 1

  // ---- Taking screen -------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-ink-subtle">
          <span>
            Question {index + 1} of {total}
          </span>
          <span>{answeredCount} answered</span>
        </div>
        <Progress
          value={((index + 1) / total) * 100}
          label={`Question ${index + 1} of ${total}`}
        />
      </div>

      <Card>
        <CardContent className="space-y-4">
          <p className="text-base font-medium text-ink leading-relaxed">{question.text}</p>

          {question.options.length > 0 ? (
            <>
              <p className="text-xs text-ink-subtle">Tap every answer that applies.</p>
              <div className="space-y-2">
                {question.options.map((o) => {
                  const isOn = selected.includes(o.index)
                  return (
                    <button
                      key={o.index}
                      type="button"
                      aria-pressed={isOn}
                      onClick={() => toggleOption(question.refreshQuestionId, o.index)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-[var(--radius-sm)] border p-3 text-left text-sm transition-colors',
                        isOn
                          ? 'border-[var(--brand-400)] bg-[var(--brand-50)] text-ink'
                          : 'border-line bg-surface text-ink hover:bg-surface-2',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border',
                          isOn
                            ? 'border-[var(--brand-500)] bg-[var(--brand-500)] text-white'
                            : 'border-line-strong bg-surface',
                        )}
                      >
                        {isOn ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                      </span>
                      <span className="leading-relaxed">{o.text}</span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <Notice tone="info" title="Reflection question">
              This one has no set answer — think it through, then continue.
            </Notice>
          )}
        </CardContent>
      </Card>

      {/* Action bar — Prev on the left, advance or submit on the right. */}
      <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-line bg-surface/95 p-3 shadow-sm backdrop-blur">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => goTo(index - 1)}
          disabled={index === 0 || submitting}
        >
          <ChevronLeft aria-hidden />
          Back
        </Button>

        {isLast ? (
          <div className="flex items-center gap-3">
            {unanswered > 0 ? (
              <span className="hidden text-xs text-ink-subtle sm:inline">
                {unanswered} left blank
              </span>
            ) : null}
            <Button onClick={submit} loading={submitting}>
              <Sparkles aria-hidden />
              See how I did
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => goTo(index + 1)} disabled={submitting}>
            Next
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  )
}

/** The learning-oriented result: readiness first, strengths before brush-ups. */
function ResultScreen({
  result,
  total,
  attemptsUsed,
  maxAttempts,
  onRetake,
}: {
  result: Result
  total: number
  attemptsUsed: number
  maxAttempts: number
  onRetake: () => void
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={readinessBadgeTone(result.readiness.level)}>{result.readiness.label}</Badge>
            <span className="text-xs text-ink-subtle">
              Attempt {attemptsUsed} of {maxAttempts}
            </span>
          </div>

          <p className="text-lg font-medium text-ink leading-snug">{result.readiness.headline}</p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">
                You got {result.correctCount} of {total} right
              </span>
              <span className="font-medium text-ink">{result.percent}%</span>
            </div>
            <Progress
              value={result.percent}
              tone={readinessTone(result.readiness.level)}
              label="Your score on this refresher"
            />
          </div>
        </CardContent>
      </Card>

      {result.strengths.length > 0 ? (
        <Notice tone="success" title="You’re solid on">
          {result.strengths.join(' · ')}
        </Notice>
      ) : null}

      {result.toRefresh.length > 0 ? (
        <Notice tone="warning" title="Worth a quick refresh">
          {result.toRefresh.join(' · ')}
        </Notice>
      ) : null}

      {result.note ? (
        <Card>
          <CardContent className="space-y-1.5">
            <p className="text-sm font-semibold text-ink">Your 2-minute refresh</p>
            <p className="whitespace-pre-line text-sm text-ink-muted leading-relaxed">
              {result.note}
            </p>
            {result.generatedByAi ? (
              <p className="pt-1 text-xs text-ink-subtle">Suggested for you — please use your judgement.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/teacher/refresh" className={buttonVariants({ variant: 'secondary' })}>
          <ArrowLeft aria-hidden />
          Back to my refreshers
        </Link>
        {result.canRetake ? (
          <Button variant="ghost" onClick={onRetake}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  )
}
