import Link from 'next/link'
import { requireContext } from '@/server/context'
import { redirect } from 'next/navigation'
import { myResult } from '@/server/modules/assessments/evaluation'
import { attemptLearningFeedback } from '@/server/modules/ai-assessment/insights'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Notice } from '@/components/ui/states'

export const metadata = { title: 'Result' }

/**
 * The student's marked paper.
 *
 * The route takes the attempt id, and `myResult` refuses both an attempt that
 * is not theirs and one that has not been released — so the answer key cannot
 * be reached by guessing a URL before the teacher has finished marking.
 */
export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext()
  if (!ctx.can('assessments.attempt') && !ctx.can('results.view')) {
    redirect('/403')
  }
  const [result, feedback] = await Promise.all([myResult(ctx, id), attemptLearningFeedback(ctx, id)])

  const percent = feedback.percent
  const parentView = feedback.parentView

  let number = 0

  return (
    <div>
      <PageHeader
        title={result.title}
        description={`${result.subject} · marked and released`}
        breadcrumbs={[{ label: 'My assessments', href: '/my/assessments' }, { label: 'Result' }]}
        actions={
          <Link
            href={`/my/results/${id}/print`}
            className="text-sm font-medium text-[var(--brand-600)] underline"
          >
            Print feedback
          </Link>
        }
      />

      <MetricRow columns={2}>
        <Metric
          label={parentView ? 'Score' : 'Your score'}
          value={result.score === null ? '—' : `${result.score}`}
          sub={`out of ${result.totalMarks}`}
          emphasis="success"
        />
        <Metric label="Percentage" value={percent === null ? '—' : `${percent}%`} />
      </MetricRow>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">
            {parentView ? 'Learning summary' : 'How you did'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--fg)]">{feedback.summary}</p>

          {(feedback.strengths.length > 0 || feedback.weakTopics.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Strengths</p>
                {feedback.strengths.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">None tagged on this paper.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1">
                    {feedback.strengths.map((topic) => (
                      <li key={topic.id} className="text-sm">
                        <Badge tone="success" className="mr-2">
                          {topic.successRate}%
                        </Badge>
                        {topic.name}
                        <span className="text-[var(--muted)]"> · {topic.chapter}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Worth another look
                </p>
                {feedback.weakTopics.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">No weak topics on this paper.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1">
                    {feedback.weakTopics.map((topic) => (
                      <li key={topic.id} className="text-sm">
                        <Badge tone="warning" className="mr-2">
                          {topic.successRate}%
                        </Badge>
                        {topic.name}
                        <span className="text-[var(--muted)]"> · {topic.chapter}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <Notice tone="info" title="Practice">
            {feedback.practiceNote}
          </Notice>

          {!parentView && feedback.practiceTips.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Teacher / AI notes</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--fg)]">
                {feedback.practiceTips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {!parentView &&
          (feedback.conceptsCovered.length > 0 || feedback.conceptsMissing.length > 0) ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {feedback.conceptsCovered.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Concepts you showed
                  </p>
                  <p className="mt-1 text-sm">{feedback.conceptsCovered.join(', ')}</p>
                </div>
              ) : null}
              {feedback.conceptsMissing.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Concepts to revise
                  </p>
                  <p className="mt-1 text-sm">{feedback.conceptsMissing.join(', ')}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {result.teacherComment && (
        <Card className="mt-4">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-ink-subtle">From your teacher</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{result.teacherComment}</p>
          </CardContent>
        </Card>
      )}

      {parentView ? (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-sm font-medium text-[var(--brand-600)]">
            Question-by-question marks
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <QuestionList result={result} startNumber={0} />
          </div>
        </details>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <QuestionList result={result} startNumber={0} />
        </div>
      )}

      <p className="mt-6 text-sm text-[var(--muted)]">
        <Link href="/my/assessments" className="underline">
          Back to my assessments
        </Link>
      </p>
    </div>
  )
}

function QuestionList({
  result,
  startNumber,
}: {
  result: Awaited<ReturnType<typeof myResult>>
  startNumber: number
}) {
  let number = startNumber
  return (
    <>
      {result.sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {section.title}
          </h2>

          {section.questions.map((question) => {
            number += 1
            const full = question.marksAwarded !== null && question.marksAwarded >= question.marks
            return (
              <Card key={question.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-ink">
                      <span className="font-medium tnum">{number}. </span>
                      <span className="whitespace-pre-wrap">{question.text}</span>
                    </p>
                    <Badge tone={full ? 'success' : question.marksAwarded ? 'warning' : 'neutral'}>
                      {question.marksAwarded ?? 0} / {question.marks}
                    </Badge>
                  </div>

                  {question.options.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-1">
                      {question.options.map((option, index) => (
                        <li
                          key={index}
                          className="flex flex-wrap items-center gap-2 text-sm text-ink-muted"
                        >
                          <span className={option.chosen ? 'text-ink' : ''}>{option.text}</span>
                          {option.isCorrect && <Badge tone="success">correct</Badge>}
                          {option.chosen && <Badge tone="info">your answer</Badge>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-3 rounded-[var(--radius-sm)] border border-line bg-surface-2/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-ink-subtle">Your answer</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                        {question.responseText?.trim() ? question.responseText : 'Left blank.'}
                      </p>
                    </div>
                  )}

                  {question.expectedAnswer && (
                    <div className="mt-2 rounded-[var(--radius-sm)] border border-dashed border-line-strong p-3">
                      <p className="text-xs uppercase tracking-wide text-ink-subtle">
                        What was expected
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
                        {question.expectedAnswer}
                      </p>
                    </div>
                  )}

                  {question.teacherComment && (
                    <p className="mt-2 text-sm text-ink-muted">
                      <span className="font-medium text-ink">Teacher: </span>
                      {question.teacherComment}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}
    </>
  )
}
