'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, CheckCircle2, Copy, ExternalLink, PartyPopper, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Checkbox } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { documentEmbedUrl, videoEmbedUrl } from '@/lib/lms/media'
import type { QuizResult } from '@/lib/lms/options'
import { cn } from '@/lib/utils'
import { LessonText } from './lesson-text'
import { ProjectPanel, type ProjectSubmissionView } from './project-panel'
import type { LmsResult, PlayerLesson, QuizActionResult } from './types'

export function LessonPlayer({
  lesson,
  completed,
  bestScore,
  markDone,
  submitQuiz,
  nextHref,
  finishHref,
  preview,
  project,
  submitProject,
}: {
  lesson: PlayerLesson
  completed: boolean
  bestScore?: number | null
  /** Bound server action; absent in staff preview. */
  markDone?: () => Promise<LmsResult & { courseComplete?: boolean }>
  submitQuiz: (answers: Record<string, string[]>) => Promise<QuizActionResult>
  nextHref: string | null
  /** Where to go once the last lesson is done. */
  finishHref: string
  preview?: boolean
  project?: ProjectSubmissionView | null
  /** Bound server action for PROJECT lessons; absent in staff preview. */
  submitProject?: (input: { note: string; linkUrl: string }) => Promise<LmsResult>
}) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const [done, setDone] = React.useState(completed)
  const [courseDone, setCourseDone] = React.useState(false)

  function complete() {
    if (!markDone) return
    startTransition(async () => {
      const result = await markDone()
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (!result.ok) return
      setDone(true)
      if (result.courseComplete) setCourseDone(true)
      else if (nextHref) router.push(nextHref)
      router.refresh()
    })
  }

  const video = lesson.kind === 'VIDEO' ? videoEmbedUrl(lesson.videoUrl) : null
  const doc = lesson.kind === 'DOCUMENT' ? documentEmbedUrl(lesson.documentUrl) : null

  return (
    <div className="space-y-5">
      {video ? (
        <div className="aspect-video w-full overflow-hidden rounded-[var(--radius-lg)] border border-line bg-black">
          <iframe
            src={video}
            title={lesson.title}
            className="size-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ) : null}

      {lesson.kind === 'DOCUMENT' && lesson.documentUrl ? (
        <div className="space-y-2">
          {doc ? (
            <div className="aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface-2">
              <iframe src={doc} title={lesson.title} className="size-full" allowFullScreen />
            </div>
          ) : null}
          <a href={lesson.documentUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <ExternalLink /> Open in a new tab
          </a>
        </div>
      ) : null}

      {lesson.body ? <LessonText text={lesson.body} className="max-w-3xl" /> : null}

      {lesson.kind === 'PROJECT' ? (
        submitProject && !preview ? (
          <ProjectPanel submission={project ?? null} submit={submitProject} />
        ) : (
          <Notice tone="info" title="Project">
            Students hand in a note and a link to their work here. A teacher approves it under Project reviews, which completes the lesson.
          </Notice>
        )
      ) : null}

      {lesson.kind === 'CODE' && lesson.code ? <CodeBlock code={lesson.code} language={lesson.codeLanguage} /> : null}

      {lesson.kind === 'QUIZ' ? (
        <QuizRunner
          key={lesson.id}
          lesson={lesson}
          bestScore={bestScore ?? null}
          submitQuiz={submitQuiz}
          preview={preview}
          onPassed={(courseComplete) => {
            setDone(true)
            if (courseComplete) setCourseDone(true)
            router.refresh()
          }}
        />
      ) : null}

      {courseDone ? (
        <Notice tone="success" title="Course complete">
          <p className="flex items-center gap-2">
            <PartyPopper className="size-4" aria-hidden /> You finished every lesson. Brilliant work!
          </p>
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {lesson.kind !== 'QUIZ' && lesson.kind !== 'PROJECT' && !preview ? (
          done ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" aria-hidden /> Done
            </span>
          ) : (
            <Button loading={pending} onClick={complete}>
              <Check /> Mark as done{nextHref ? ' and continue' : ''}
            </Button>
          )
        ) : null}
        {nextHref ? (
          <Link href={nextHref} className={buttonVariants({ variant: done || preview ? 'primary' : 'ghost' })}>
            Next lesson <ArrowRight />
          </Link>
        ) : done || preview ? (
          <Link href={finishHref} className={buttonVariants({ variant: 'secondary' })}>
            Back to the course
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function CodeBlock({ code, language }: { code: string; language: string | null }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-line">
      <div className="flex items-center justify-between bg-surface-2 px-3 py-1.5 text-xs text-ink-muted">
        <span className="font-mono">{language ?? 'code'}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-ink"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-[#0f172a] p-4 text-[13px] leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function QuizRunner({
  lesson,
  bestScore,
  submitQuiz,
  preview,
  onPassed,
}: {
  lesson: PlayerLesson
  bestScore: number | null
  submitQuiz: (answers: Record<string, string[]>) => Promise<QuizActionResult>
  preview?: boolean
  onPassed: (courseComplete: boolean) => void
}) {
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const [answers, setAnswers] = React.useState<Record<string, string[]>>({})
  const [result, setResult] = React.useState<QuizResult | null>(null)

  const answered = lesson.quiz.filter((q) => (answers[q.id]?.length ?? 0) > 0).length

  function choose(questionId: string, optionId: string, multiple: boolean) {
    if (result) return
    setAnswers((a) => {
      const current = a[questionId] ?? []
      if (!multiple) return { ...a, [questionId]: [optionId] }
      return { ...a, [questionId]: current.includes(optionId) ? current.filter((x) => x !== optionId) : [...current, optionId] }
    })
  }

  function submit() {
    startTransition(async () => {
      const outcome = await submitQuiz(answers)
      if (!outcome.ok) {
        push({ tone: 'error', title: outcome.message })
        return
      }
      setResult(outcome.result)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      if (outcome.result.passed && !preview) onPassed(outcome.courseComplete)
    })
  }

  const byId = new Map(result?.questions.map((q) => [q.id, q]))

  return (
    <div className="space-y-4">
      {result ? (
        <Notice tone={result.passed ? 'success' : 'warning'} title={result.passed ? 'Passed!' : 'Not quite yet'}>
          You got {result.correctCount} of {result.totalCount} right ({result.scorePercent}%). The pass mark is {lesson.passPercent}%.
          {preview ? ' (Preview: nothing was saved.)' : ''}
        </Notice>
      ) : bestScore !== null ? (
        <p className="text-sm text-ink-muted">Your best score so far: {bestScore}%. Pass mark {lesson.passPercent}%.</p>
      ) : (
        <p className="text-sm text-ink-muted">
          {lesson.quiz.length} question{lesson.quiz.length === 1 ? '' : 's'} · pass mark {lesson.passPercent}%
        </p>
      )}

      <ol className="space-y-4">
        {lesson.quiz.map((q, qi) => {
          const graded = byId.get(q.id)
          return (
            <li key={q.id} className="rounded-[var(--radius)] border border-line p-4">
              <p className="text-sm font-medium text-ink">
                <span className="text-ink-subtle mr-1.5">{qi + 1}.</span>
                {q.prompt}
              </p>
              {q.multiple ? <p className="text-xs text-ink-subtle mt-0.5">Choose all that apply</p> : null}
              <div className="mt-3 space-y-1.5">
                {q.options.map((o) => {
                  const picked = answers[q.id]?.includes(o.id) ?? false
                  const right = graded?.correctOptionIds.includes(o.id) ?? false
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        'flex items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2 text-sm transition-colors',
                        result ? 'cursor-default' : 'cursor-pointer hover:bg-surface-2',
                        !graded && picked && 'border-[var(--brand-500)] bg-[var(--brand-50)]',
                        !graded && !picked && 'border-line',
                        graded && right && 'border-[var(--success)] bg-success-bg',
                        graded && picked && !right && 'border-[var(--danger)] bg-danger-bg',
                        graded && !picked && !right && 'border-line opacity-70',
                      )}
                    >
                      {q.multiple ? (
                        <Checkbox checked={picked} disabled={!!result} onChange={() => choose(q.id, o.id, true)} />
                      ) : (
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={picked}
                          disabled={!!result}
                          onChange={() => choose(q.id, o.id, false)}
                          className="size-4 accent-[var(--brand-500)]"
                        />
                      )}
                      <span className="flex-1">{o.text}</span>
                      {graded && right ? <CheckCircle2 className="size-4 text-success" aria-label="Correct answer" /> : null}
                      {graded && picked && !right ? <XCircle className="size-4 text-[var(--danger)]" aria-label="Your answer" /> : null}
                    </label>
                  )
                })}
              </div>
              {graded?.explanation ? <p className="mt-2 text-xs text-ink-muted">{graded.explanation}</p> : null}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {!result ? (
          <Button loading={pending} disabled={answered < lesson.quiz.length} onClick={submit}>
            Submit answers {answered < lesson.quiz.length ? `(${answered}/${lesson.quiz.length})` : ''}
          </Button>
        ) : !result.passed || preview ? (
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null)
              setAnswers({})
            }}
          >
            <RotateCcw /> Try again
          </Button>
        ) : null}
      </div>
    </div>
  )
}
