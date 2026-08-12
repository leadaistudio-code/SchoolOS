import { requireContext } from '@/server/context'
import { getQuestion } from '@/server/modules/questions/service'
import {
  BLOOM_LABEL,
  QUESTION_TYPE_LABEL,
  type BloomKey,
  type QuestionTypeKey,
} from '@/lib/questions'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle, DescriptionItem, DescriptionList } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { QuestionActions } from './actions'

export const metadata = { title: 'Question' }

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('questionbank.view')
  const question = await getQuestion(ctx, id)

  return (
    <div>
      <PageHeader
        title={QUESTION_TYPE_LABEL[question.type as QuestionTypeKey]}
        description={`${question.marks} ${question.marks === 1 ? 'mark' : 'marks'} · ${question.difficulty.toLowerCase()}`}
        breadcrumbs={[
          { label: 'Assessments', href: '/assessments/bank' },
          { label: 'Question bank', href: '/assessments/bank' },
          { label: 'Question' },
        ]}
        actions={
          <QuestionActions
            id={question.id}
            status={question.status}
            canApprove={ctx.can('questionbank.approve')}
            canDelete={ctx.can('questionbank.delete')}
          />
        }
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="whitespace-pre-wrap text-base text-ink">{question.text}</p>

            {question.options.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {question.options.map((option, index) => (
                  <li key={option.id} className="flex items-start gap-2 text-sm">
                    <span className="text-ink-subtle tnum">
                      {String.fromCharCode(65 + index)}.
                    </span>
                    <span className="text-ink">{option.text}</span>
                    {option.matchWith && (
                      <span className="text-ink-muted">→ {option.matchWith}</span>
                    )}
                    {option.isCorrect && <Badge tone="success">correct</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {(question.solution || question.explanation) && (
          <Card>
            <CardHeader>
              <CardTitle>Answer</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {question.solution && (
                <p className="whitespace-pre-wrap text-sm text-ink">{question.solution}</p>
              )}
              {question.explanation && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    Explanation
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
                    {question.explanation}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filing</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <DescriptionItem label="Status">
                <Badge tone={question.status === 'APPROVED' ? 'success' : 'neutral'}>
                  {question.status.toLowerCase()}
                </Badge>
              </DescriptionItem>
              <DescriptionItem label="Origin">
                {question.origin === 'AI' ? 'Generated, then reviewed' : 'Written by a teacher'}
              </DescriptionItem>
              <DescriptionItem label="Bloom's level">
                {question.bloomLevel ? BLOOM_LABEL[question.bloomLevel as BloomKey] : 'Not set'}
              </DescriptionItem>
              <DescriptionItem label="Shared">
                {question.isShared ? 'With the school' : 'Private to the author'}
              </DescriptionItem>
              <DescriptionItem label="Topics">
                {question.topics.length === 0
                  ? 'Not tagged'
                  : question.topics.map((t) => t.topic.name).join(', ')}
              </DescriptionItem>
              <DescriptionItem label="Source">{question.source ?? '—'}</DescriptionItem>
            </DescriptionList>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
