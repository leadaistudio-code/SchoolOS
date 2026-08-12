import { requireContext } from '@/server/context'
import { assignmentAnalytics } from '@/server/modules/assessments/evaluation'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState, Notice } from '@/components/ui/states'
import { QUESTION_TYPE_LABEL, type QuestionTypeKey } from '@/lib/questions'

export const metadata = { title: 'Analytics' }

/** A bar that reads as a proportion without needing a chart library. */
function Meter({ value }: { value: number }) {
  const tone =
    value >= 75
      ? 'var(--success)'
      : value >= 50
        ? 'var(--warning)'
        : 'var(--danger)'
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`${value} per cent`}
      >
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: tone }} />
      </div>
      <span className="text-sm tnum text-ink-muted">{value}%</span>
    </div>
  )
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>
}) {
  const { id, assignmentId } = await params
  const ctx = await requireContext('assessments.view')
  const data = await assignmentAnalytics(ctx, assignmentId)
  const { summary } = data

  return (
    <div>
      <PageHeader
        title={`${data.assessment.title} — results`}
        description={`${summary.marked} marked of ${summary.submitted} submitted · ${summary.cohort} in the class`}
        breadcrumbs={[
          { label: 'Question papers', href: '/assessments' },
          { label: data.assessment.title, href: `/assessments/${id}` },
          { label: 'Attempts', href: `/assessments/${id}/evaluate/${assignmentId}` },
          { label: 'Analytics' },
        ]}
      />

      {summary.marked === 0 ? (
        <Card>
          <EmptyState
            title="Nothing marked yet"
            description="Figures appear once papers have been marked. Auto-marked scores alone would misrepresent a paper with written answers."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <MetricRow columns={4}>
            <Metric
              label="Average"
              value={summary.average === null ? '—' : String(summary.average)}
              sub={`out of ${summary.totalMarks}`}
            />
            <Metric
              label="Highest"
              value={summary.highest === null ? '—' : String(summary.highest)}
            />
            <Metric label="Lowest" value={summary.lowest === null ? '—' : String(summary.lowest)} />
            <Metric
              label="Passed"
              value={summary.passRate === null ? '—' : `${summary.passRate}%`}
              sub="at a third of the marks"
            />
          </MetricRow>

          <MetricRow columns={2}>
            <Metric
              label="Submission rate"
              value={`${summary.submissionRate}%`}
              sub={`${summary.submitted} of ${summary.cohort} students`}
            />
            <Metric
              label="Marked"
              value={`${summary.marked}`}
              sub={`${summary.submitted - summary.marked} still to mark`}
            />
          </MetricRow>

          {data.gaps.length > 0 && (
            <Notice tone="warning" title="Where the class struggled">
              <ul className="mt-2 flex flex-col gap-1">
                {data.gaps.map((topic) => (
                  <li key={topic.id} className="text-sm">
                    <strong>{topic.name}</strong>{' '}
                    <span className="text-ink-muted">
                      ({topic.chapter}) — {topic.successRate}% of the marks available were earned
                      across {topic.questions}{' '}
                      {topic.questions === 1 ? 'question' : 'questions'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-ink-muted">
                These are observations from one paper, not a verdict on the class. A topic can score
                low because it was asked in a hard question rather than because it was not
                understood.
              </p>
            </Notice>
          )}

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>By topic</CardTitle>
            </CardHeader>
            {data.byTopic.length === 0 ? (
              <CardContent>
                <p className="text-sm text-ink-muted">
                  No topic breakdown: the questions in this paper are not tagged to syllabus topics.
                  Tag them in the bank and the next paper will show where a class is losing marks.
                </p>
              </CardContent>
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Topic</TH>
                      <TH>Chapter</TH>
                      <TH align="right">Questions</TH>
                      <TH>Marks earned</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {data.byTopic.map((topic) => (
                      <TR key={topic.id}>
                        <TD className="text-sm text-ink">{topic.name}</TD>
                        <TD className="text-sm text-ink-muted">{topic.chapter}</TD>
                        <TD align="right" className="text-sm tnum">
                          {topic.questions}
                        </TD>
                        <TD>{topic.successRate === null ? '—' : <Meter value={topic.successRate} />}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>By question</CardTitle>
              <p className="mt-1 text-sm text-ink-muted">
                Hardest first — the questions the class earned least of.
              </p>
            </CardHeader>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Question</TH>
                    <TH>Type</TH>
                    <TH align="right">Marks</TH>
                    <TH align="right">Answered</TH>
                    <TH>Marks earned</TH>
                  </tr>
                </THead>
                <TBody>
                  {data.perQuestion.map((question) => (
                    <TR key={question.id}>
                      <TD className="max-w-md text-sm text-ink">
                        {question.text.length > 110
                          ? `${question.text.slice(0, 110)}…`
                          : question.text}
                        {question.topics.length > 0 && (
                          <span className="mt-0.5 block text-xs text-ink-subtle">
                            {question.topics.map((topic) => topic.name).join(', ')}
                          </span>
                        )}
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {QUESTION_TYPE_LABEL[question.type as QuestionTypeKey] ?? question.type}
                        <Badge tone="neutral" className="ml-2">
                          {question.difficulty.toLowerCase()}
                        </Badge>
                      </TD>
                      <TD align="right" className="text-sm tnum">
                        {question.marks}
                      </TD>
                      <TD align="right" className="text-sm tnum">
                        {question.answered}
                      </TD>
                      <TD>
                        {question.successRate === null ? (
                          <span className="text-sm text-ink-subtle">not marked</span>
                        ) : (
                          <Meter value={question.successRate} />
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </Card>
        </div>
      )}
    </div>
  )
}
