import { requireContext } from '@/server/context'
import { myResult } from '@/server/modules/assessments/evaluation'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Metric, MetricRow } from '@/components/ui/metric'

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
  const ctx = await requireContext('assessments.attempt')
  const result = await myResult(ctx, id)

  const percent =
    result.score !== null && result.totalMarks > 0
      ? Math.round((result.score / result.totalMarks) * 100)
      : null

  let number = 0

  return (
    <div>
      <PageHeader
        title={result.title}
        description={`${result.subject} · marked and released`}
        breadcrumbs={[{ label: 'My assessments', href: '/my/assessments' }, { label: 'Result' }]}
      />

      <MetricRow columns={2}>
        <Metric
          label="Your score"
          value={result.score === null ? '—' : `${result.score}`}
          sub={`out of ${result.totalMarks}`}
          emphasis="success"
        />
        <Metric label="Percentage" value={percent === null ? '—' : `${percent}%`} />
      </MetricRow>

      {result.teacherComment && (
        <Card className="mt-4">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wide text-ink-subtle">From your teacher</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{result.teacherComment}</p>
          </CardContent>
        </Card>
      )}

      <div className="mt-4 flex flex-col gap-3">
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
                        <p className="text-xs uppercase tracking-wide text-ink-subtle">
                          Your answer
                        </p>
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
      </div>
    </div>
  )
}
