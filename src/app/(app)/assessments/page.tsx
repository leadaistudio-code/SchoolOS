import Link from 'next/link'
import { requireContext } from '@/server/context'
import { assessmentFilterSchema, listAssessments } from '@/server/modules/assessments/service'
import { ASSESSMENT_STATUS_LABEL, ASSESSMENT_STATUS_TONE } from '@/lib/assessments'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatDay } from '@/lib/dates'

export const metadata = { title: 'Question papers' }

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  )

  const ctx = await requireContext('assessments.view')
  const query = parseListQuery(flat)
  const filter = assessmentFilterSchema.parse(flat)
  const { rows, total } = await listAssessments(ctx, query, filter)

  return (
    <div>
      <PageHeader
        title="Question papers"
        description={`${total} papers`}
        actions={
          ctx.can('assessments.create') ? (
            <Link href="/assessments/new" className={buttonVariants({ variant: 'primary' })}>
              New paper
            </Link>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No papers yet"
            description="Build one from the syllabus and your question bank."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Paper</TH>
                  <TH>Class</TH>
                  <TH>Type</TH>
                  <TH align="right">Questions</TH>
                  <TH align="right">Marks</TH>
                  <TH align="right">Minutes</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <Link
                        href={`/assessments/${row.id}`}
                        className="text-sm font-medium text-ink hover:underline"
                      >
                        {row.title}
                      </Link>
                      {row.setLabel && (
                        <Badge tone="neutral" className="ml-2">
                          Set {row.setLabel}
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {row.classSubject.classLevel.name}
                      {row.section ? `-${row.section.name}` : ''} · {row.classSubject.subject.name}
                    </TD>
                    <TD className="text-sm text-ink-muted">{row.type.name}</TD>
                    <TD align="right" className="text-sm tnum">
                      {row._count.questions}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {row.totalMarks}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {row.durationMinutes}
                    </TD>
                    <TD>
                      <Badge tone={ASSESSMENT_STATUS_TONE[row.status] ?? 'neutral'}>
                        {ASSESSMENT_STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                    </TD>
                    <TD className="text-sm text-ink-muted">{formatDay(row.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Pagination page={query.page} pageSize={query.pageSize} total={total} label="papers" />
    </div>
  )
}
