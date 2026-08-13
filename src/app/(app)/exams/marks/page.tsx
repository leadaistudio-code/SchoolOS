import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listExams } from '@/server/modules/exams/service'
import { parseListQuery } from '@/lib/query'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'Marks entry' }

export default async function MarksEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('exams.marks')
  const params = await searchParams
  const query = parseListQuery(params)
  const { rows, total } = await listExams(ctx, query)
  const open = rows.filter((exam) => exam.status !== 'ARCHIVED')

  return (
    <div>
      <PageHeader
        title="Marks entry"
        description="Choose an examination, then enter marks per paper."
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search exams" />

        {open.length === 0 ? (
          <EmptyState
            title={params.q ? 'No exams match that search' : 'No examinations ready for marks'}
            description="Create an exam first, then return here to enter scores."
            action={
              ctx.can('exams.manage') ? (
                <Link href="/exams/new" className="text-sm text-[var(--brand-600)] hover:underline">
                  Set up an exam
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Examination</TH>
                    <TH>Starts</TH>
                    <TH align="right">Papers</TH>
                    <TH>Status</TH>
                    <TH align="right">
                      <span className="sr-only">Open</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {open.map((exam) => (
                    <TR key={exam.id}>
                      <TD>
                        <Link
                          href={`/exams/${exam.id}/marks`}
                          className="text-sm font-medium text-ink hover:text-[var(--brand-600)]"
                        >
                          {exam.name}
                        </Link>
                      </TD>
                      <TD>{exam.startsOn ? formatDay(exam.startsOn, 'd MMM yyyy') : '—'}</TD>
                      <TD align="right">{exam._count.subjects}</TD>
                      <TD>
                        <StatusBadge status={exam.status} />
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/exams/${exam.id}/marks`}
                          className="text-sm text-[var(--brand-600)] hover:underline"
                        >
                          Enter marks
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="exams" />
          </>
        )}
      </Card>
    </div>
  )
}
