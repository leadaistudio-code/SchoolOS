import { requireContext } from '@/server/context'
import { listExams, listGradingScales, listResults } from '@/server/modules/exams/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { LinkTabs } from '@/components/ui/tabs'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { PersonCell } from '@/components/ui/identity'
import { ResultControls } from './result-controls'

export const metadata = { title: 'Results' }

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string }>
}) {
  const ctx = await requireContext('results.view')
  const { exam: examId } = await searchParams
  const exams = (await listExams(ctx, parseListQuery({ page: 1, pageSize: 100 }))).rows
  const selected = exams.find((exam) => exam.id === examId) ?? exams[0]
  const results = await listResults(ctx, selected?.id)
  const scales = ctx.can('exams.manage') ? await listGradingScales(ctx) : []
  const publishedCount = results.filter((r) => r.publishedAt).length

  return (
    <div>
      <PageHeader
        title="Results"
        description={
          selected
            ? `${selected.name} · ${results.length} computed · ${publishedCount} published`
            : undefined
        }
      />

      <LinkTabs
        label="Examination"
        className="mb-4"
        items={exams.map((exam) => ({
          label: exam.name,
          href: `/exams/results?exam=${exam.id}`,
          active: selected?.id === exam.id,
        }))}
      />

      {selected && (ctx.can('exams.manage') || ctx.can('exams.publish')) ? (
        <ResultControls
          examId={selected.id}
          gradingScaleId={selected.gradingScaleId}
          scales={scales.map((scale) => ({ id: scale.id, name: scale.name }))}
          canCompute={ctx.can('exams.manage')}
          canPublish={ctx.can('exams.publish')}
          published={selected.status === 'PUBLISHED'}
        />
      ) : null}

      {selected && ctx.can('results.export') && results.length > 0 ? (
        <p className="mt-3">
          <a
            href={`/api/v1/exams/results/export?exam=${selected.id}`}
            className="text-sm text-[var(--brand-600)] hover:underline"
          >
            Download CSV
          </a>
        </p>
      ) : null}

      <Card className="mt-4 overflow-hidden">
        {!selected ? (
          <EmptyState
            title="No examinations yet"
            description="Create an exam before computing results."
          />
        ) : results.length === 0 ? (
          <EmptyState
            title="No computed results"
            description="Complete marks entry, assign a grading scale, then calculate results."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Class</TH>
                  <TH align="right">Score</TH>
                  <TH align="right">Percentage</TH>
                  <TH align="center">Grade</TH>
                  <TH align="right">Rank</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {results.map((result) => (
                  <TR key={result.id}>
                    <TD>
                      <PersonCell
                        firstName={result.student.firstName}
                        lastName={result.student.lastName}
                        secondary={result.student.admissionNo}
                      />
                    </TD>
                    <TD>{result.student.enrollments[0]?.classLevel.name ?? '—'}</TD>
                    <TD align="right">
                      {result.totalObtained}/{result.totalMax}
                    </TD>
                    <TD align="right" className="text-ink font-medium">
                      {result.percentage}%
                    </TD>
                    <TD align="center" className="text-ink">
                      {result.grade ?? '—'}
                    </TD>
                    <TD align="right">{result.rankInClass ?? '—'}</TD>
                    <TD>
                      <StatusBadge status={result.publishedAt ? 'PUBLISHED' : 'DRAFT'} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
