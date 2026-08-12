'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { QUESTION_TYPE_LABEL, type QuestionTypeKey } from '@/lib/questions'

type Question = {
  placementId: string
  answerId: string | null
  marks: number
  text: string
  type: string
  objective: boolean
  expectedAnswer: string | null
  options: { text: string; isCorrect: boolean; chosen: boolean }[]
  responseText: string | null
  isCorrect: boolean | null
  marksAwarded: number | null
  teacherComment: string | null
}

type Attempt = {
  id: string
  status: string
  objectiveScore: number | null
  totalScore: number | null
  published: boolean
  teacherComment: string | null
  assessment: { title: string; totalMarks: number }
  sections: { id: string; title: string; questions: Question[] }[]
  outstanding: number
}

/**
 * The marking sheet.
 *
 * Objective questions arrive already scored and are shown, not re-asked — a
 * marker who has to confirm forty MCQs the computer already marked will stop
 * reading by the tenth. What is asked for is exactly the part a person has to
 * judge: the written answers, each beside the expected points the paper was set
 * with.
 */
export function MarkingSheet({ attempt }: { attempt: Attempt }) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [comment, setComment] = React.useState(attempt.teacherComment ?? '')
  const [saved, setSaved] = React.useState<Record<string, number>>({})

  const questions = attempt.sections.flatMap((section) => section.questions)
  const awarded = questions.reduce(
    (sum, question) => sum + (saved[question.placementId] ?? question.marksAwarded ?? 0),
    0,
  )
  const outstanding = questions.filter(
    (question) =>
      !question.objective &&
      question.marksAwarded === null &&
      saved[question.placementId] === undefined,
  ).length

  async function mark(question: Question, marksAwarded: number, teacherComment?: string) {
    if (!question.answerId) {
      push({
        tone: 'error',
        title: 'Nothing to mark',
        description: 'This question was left blank.',
      })
      return
    }
    if (marksAwarded > question.marks) {
      push({
        tone: 'error',
        title: 'Too many marks',
        description: `This question is worth ${question.marks}.`,
      })
      return
    }

    setBusy(true)
    try {
      const res = await fetch(`/api/v1/answers/${question.answerId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ marksAwarded, teacherComment: teacherComment ?? null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        push({
          tone: 'error',
          title: 'Not saved',
          description: body?.error?.message ?? 'Please try again.',
        })
        return
      }
      setSaved((prev) => ({ ...prev, [question.placementId]: marksAwarded }))
    } finally {
      setBusy(false)
    }
  }

  let number = 0

  return (
    <div className="flex flex-col gap-4 pb-24">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-subtle">Awarded</p>
              <p className="text-lg font-semibold tnum text-ink">
                {Math.round(awarded * 100) / 100}
                <span className="text-ink-subtle"> / {attempt.assessment.totalMarks}</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-subtle">Auto-marked</p>
              <p className="text-lg font-semibold tnum text-ink">{attempt.objectiveScore ?? 0}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-subtle">Still to mark</p>
              <p className="text-lg font-semibold tnum text-ink">{outstanding}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {attempt.sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {section.title}
          </h2>

          {section.questions.map((question) => {
            number += 1
            const current = saved[question.placementId] ?? question.marksAwarded
            return (
              <Card key={question.placementId}>
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

                  {question.objective ? (
                    <div className="mt-3">
                      <ul className="flex flex-col gap-1">
                        {question.options.map((option, index) => (
                          <li
                            key={index}
                            className={
                              option.chosen
                                ? 'flex items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 p-2 text-sm'
                                : 'flex items-center gap-2 p-2 text-sm text-ink-muted'
                            }
                          >
                            <span>{option.text}</span>
                            {option.isCorrect && <Badge tone="success">correct answer</Badge>}
                            {option.chosen && <Badge tone="info">chosen</Badge>}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-sm">
                        <Badge tone={question.isCorrect ? 'success' : 'neutral'}>
                          {question.isCorrect
                            ? `${question.marksAwarded ?? question.marks} awarded`
                            : '0 awarded'}
                        </Badge>
                        <span className="ml-2 text-ink-subtle">marked automatically</span>
                      </p>
                    </div>
                  ) : (
                    <WrittenAnswer
                      question={question}
                      current={current}
                      busy={busy}
                      onMark={mark}
                    />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}

      <Card>
        <CardContent className="flex flex-col gap-3 pt-5">
          <label className="text-sm font-medium text-ink" htmlFor="overall">
            Comment for the student
          </label>
          <Textarea
            id="overall"
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What they did well, and the one thing to work on."
          />
        </CardContent>
      </Card>

      {outstanding > 0 && (
        <Notice tone="warning" title={`${outstanding} written answers still unmarked`}>
          The paper can only be totalled once every written answer has a mark. A total computed
          around them would be the auto-marked score wearing the name of a result.
        </Notice>
      )}

      <div>
        <Button
          disabled={busy || outstanding > 0}
          onClick={async () => {
            setBusy(true)
            try {
              const res = await fetch(`/api/v1/attempts/${attempt.id}/finalise`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ teacherComment: comment.trim() || null }),
              })
              const body = await res.json().catch(() => null)
              if (!res.ok) {
                push({
                  tone: 'error',
                  title: 'Not finished',
                  description: body?.error?.message ?? 'Please try again.',
                })
                return
              }
              push({
                tone: 'success',
                title: 'Marking finished',
                description: `${body.data.totalScore} of ${attempt.assessment.totalMarks}. Release the results from the attempts list.`,
              })
              router.refresh()
            } finally {
              setBusy(false)
            }
          }}
        >
          Finish marking
        </Button>
      </div>
    </div>
  )
}

function WrittenAnswer({
  question,
  current,
  busy,
  onMark,
}: {
  question: Question
  current: number | null
  busy: boolean
  onMark: (question: Question, marks: number, comment?: string) => Promise<void>
}) {
  const [marks, setMarks] = React.useState(current === null ? '' : String(current))
  const [comment, setComment] = React.useState(question.teacherComment ?? '')

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2/50 p-3">
        <p className="text-xs uppercase tracking-wide text-ink-subtle">The answer given</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
          {question.responseText?.trim() ? question.responseText : 'Left blank.'}
        </p>
      </div>

      {question.expectedAnswer && (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-line-strong p-3">
          <p className="text-xs uppercase tracking-wide text-ink-subtle">Expected points</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
            {question.expectedAnswer}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-ink-subtle" htmlFor={`marks-${question.placementId}`}>
            Marks out of {question.marks}
          </label>
          <Input
            id={`marks-${question.placementId}`}
            type="number"
            min="0"
            max={question.marks}
            step="0.5"
            className="mt-1 w-24"
            value={marks}
            onChange={(event) => setMarks(event.target.value)}
          />
        </div>

        <Input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="A note for the student, if any"
          aria-label="Comment on this answer"
          className="flex-1"
        />

        <Button
          type="button"
          variant="secondary"
          disabled={busy || marks === ''}
          onClick={() => onMark(question, Number(marks), comment.trim() || undefined)}
        >
          {current === null ? 'Award' : 'Update'}
        </Button>

        {current !== null && <Badge tone="success">{current} awarded</Badge>}
      </div>
    </div>
  )
}
