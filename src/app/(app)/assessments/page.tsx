import Link from 'next/link'
import { requireContext } from '@/server/context'
import { assessmentFilterSchema, listAssessments } from '@/server/modules/assessments/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/pagination'
import { buttonVariants } from '@/components/ui/button-variants'
import { PapersTable } from './papers-table'

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
            <div className="flex flex-wrap items-center gap-2">
              {ctx.can('questionbank.generate') ? (
                <Link
                  href="/assessments/bank/generate"
                  className={buttonVariants({ variant: 'secondary' })}
                >
                  Generate from textbook
                </Link>
              ) : null}
              <Link href="/assessments/new" className={buttonVariants({ variant: 'primary' })}>
                New paper
              </Link>
            </div>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <PapersTable rows={rows} canDelete={ctx.can('assessments.delete')} />
      </Card>

      <Pagination page={query.page} pageSize={query.pageSize} total={total} label="papers" />
    </div>
  )
}
