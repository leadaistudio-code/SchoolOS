import Link from 'next/link'
import { requireContext } from '@/server/context'
import { bankSummary, listQuestions, questionFilterSchema } from '@/server/modules/questions/service'
import { QUESTION_TYPE_LABEL, type QuestionTypeKey } from '@/lib/questions'
import { listCoverage } from '@/server/modules/curriculum/service'
import { assistantConfigured } from '@/server/assistant/providers'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { buttonVariants } from '@/components/ui/button-variants'
import { BankFilters } from './filters'

export const metadata = { title: 'Question bank' }

const DIFFICULTY_TONE = {
  EASY: 'success',
  MEDIUM: 'info',
  HARD: 'warning',
} as const

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  )

  const ctx = await requireContext('questionbank.view')
  const query = parseListQuery(flat)
  const filter = questionFilterSchema.parse(flat)

  const [{ rows, total }, summary, coverage, licensed] = await Promise.all([
    listQuestions(ctx, query, filter),
    bankSummary(ctx, filter.classSubjectId),
    listCoverage(ctx),
    hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST),
  ])

  const canCreate = ctx.can('questionbank.create')
  // Hidden rather than disabled when generation is off: a button that explains
  // why it cannot work is still a button that cannot work.
  const canGenerate = ctx.can('questionbank.generate') && licensed && assistantConfigured()

  return (
    <div>
      <PageHeader
        title="Question bank"
        description={`${total} questions match · ${summary.total} approved in all`}
        breadcrumbs={[{ label: 'Assessments', href: '/assessments/bank' }, { label: 'Question bank' }]}
        actions={
          <div className="flex items-center gap-2">
            {canGenerate && (
              <Link
                href="/assessments/bank/generate"
                className={buttonVariants({ variant: 'secondary' })}
              >
                Generate with AI
              </Link>
            )}
            {canCreate && (
              <Link href="/assessments/bank/new" className={buttonVariants({ variant: 'primary' })}>
                New question
              </Link>
            )}
          </div>
        }
      />

      <MetricRow columns={4}>
        <Metric label="Approved" value={String(summary.total)} />
        <Metric label="Easy" value={String(summary.byDifficulty.EASY ?? 0)} />
        <Metric label="Medium" value={String(summary.byDifficulty.MEDIUM ?? 0)} />
        <Metric label="Hard" value={String(summary.byDifficulty.HARD ?? 0)} />
      </MetricRow>

      <div className="mt-4">
        <BankFilters
          subjects={coverage.map((row) => ({
            id: row.classSubjectId,
            label: `${row.classLevel.name} · ${row.subject.name}`,
          }))}
          current={flat}
        />
      </div>

      <Card className="mt-4 overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No questions yet"
            description={
              canCreate
                ? 'Add questions here, or generate them from the syllabus once a paper is being built.'
                : 'Questions added by your school will appear here.'
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Question</TH>
                  <TH>Type</TH>
                  <TH>Topics</TH>
                  <TH align="right">Marks</TH>
                  <TH>Difficulty</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD className="max-w-md">
                      <Link
                        href={`/assessments/bank/${row.id}`}
                        className="text-sm text-ink hover:underline"
                      >
                        {row.text.length > 120 ? `${row.text.slice(0, 120)}…` : row.text}
                      </Link>
                      <div className="mt-0.5 text-xs text-ink-subtle">
                        {row.classSubject.classLevel.name} · {row.classSubject.subject.name}
                        {row.origin === 'AI' && ' · generated'}
                      </div>
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {QUESTION_TYPE_LABEL[row.type as QuestionTypeKey]}
                    </TD>
                    <TD className="text-xs text-ink-muted">
                      {row.topics.length === 0
                        ? '—'
                        : row.topics.map((t) => t.topic.name).join(', ')}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {row.marks}
                    </TD>
                    <TD>
                      <Badge tone={DIFFICULTY_TONE[row.difficulty as keyof typeof DIFFICULTY_TONE]}>
                        {row.difficulty.toLowerCase()}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={row.status === 'APPROVED' ? 'success' : 'neutral'}>
                        {row.status.toLowerCase()}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Pagination page={query.page} pageSize={query.pageSize} total={total} label="questions" />
    </div>
  )
}
