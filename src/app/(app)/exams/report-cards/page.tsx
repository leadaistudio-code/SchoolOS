import { requireContext } from '@/server/context'
import { listExams, listPublishedReportCards } from '@/server/modules/exams/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { LinkTabs } from '@/components/ui/tabs'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { PersonCell } from '@/components/ui/identity'

export const metadata = { title: 'Report cards' }

export default async function ReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string }>
}) {
  const ctx = await requireContext('results.view')
  const { exam: examId } = await searchParams
  const exams = (await listExams(ctx, parseListQuery({ page: 1, pageSize: 100 }))).rows
  const published = exams.filter((exam) => exam.status === 'PUBLISHED')
  const selected = published.find((exam) => exam.id === examId) ?? published[0]
  const cards = await listPublishedReportCards(ctx, selected?.id)

  return (
    <div>
      <PageHeader
        title="Report cards"
        description={selected ? `${selected.name} · ${cards.length} students` : undefined}
        actions={
          ctx.can('exams.manage') ? (
            <a href="/exams/report-cards/templates" className="text-sm text-[var(--brand-600)] hover:underline">
              Templates
            </a>
          ) : null
        }
      />

      <LinkTabs
        label="Examination"
        className="mb-4"
        items={published.map((exam) => ({
          label: exam.name,
          href: `/exams/report-cards?exam=${exam.id}`,
          active: selected?.id === exam.id,
        }))}
      />

      <Card className="overflow-hidden">
        {cards.length === 0 ? (
          <EmptyState
            title="No published report cards"
            description="Report cards appear here once an exam's results are published."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Examination</TH>
                  <TH align="right">Percentage</TH>
                  <TH align="center">Grade</TH>
                  <TH align="right">Rank</TH>
                  <TH>Result</TH>
                </tr>
              </THead>
              <TBody>
                {cards.map((card) => (
                  <TR key={card.id}>
                    <TD>
                      <PersonCell
                        firstName={card.student.firstName}
                        lastName={card.student.lastName}
                        secondary={card.student.admissionNo}
                        href={`/exams/report-cards/${card.id}`}
                        avatarUrl={card.student.photoUrl}
                      />
                    </TD>
                    <TD>{card.exam.name}</TD>
                    <TD align="right" className="text-ink font-medium">
                      {card.percentage}%
                    </TD>
                    <TD align="center" className="text-ink">
                      {card.grade ?? '—'}
                    </TD>
                    <TD align="right">{card.rankInClass ?? '—'}</TD>
                    <TD>
                      <Badge tone={card.isPass ? 'success' : 'danger'}>
                        {card.isPass ? 'Pass' : 'Not passed'}
                      </Badge>
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
