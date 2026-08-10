import Link from 'next/link'
import { Suspense } from 'react'
import { Plus, Upload } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listStudents, getClassOptions } from '@/server/modules/students/service'
import { studentListFilterSchema } from '@/server/modules/students/schema'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { TableSkeleton } from '@/components/ui/states'
import { StudentFilters } from './student-filters'
import { StudentTable } from './student-table'

export const metadata = { title: 'Students' }

type SearchParams = Promise<Record<string, string | undefined>>

export default async function StudentsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireContext('students.view')
  const params = await searchParams

  return (
    <div>
      <PageHeader
        title="Students"
        actions={
          <>
            {ctx.can('students.import') ? (
              <Link
                href="/students/import"
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                <Upload aria-hidden />
                Import
              </Link>
            ) : null}
            {ctx.can('students.create') ? (
              <Link href="/students/new" className={buttonVariants({ size: 'sm' })}>
                <Plus aria-hidden />
                Add student
              </Link>
            ) : null}
          </>
        }
      />

      <Card className="overflow-hidden">
        <StudentFilters classes={await getClassOptions(ctx)} />
        <Suspense key={JSON.stringify(params)} fallback={<TableSkeleton rows={10} cols={6} />}>
          <StudentResults params={params} />
        </Suspense>
      </Card>
    </div>
  )
}

async function StudentResults({ params }: { params: Record<string, string | undefined> }) {
  const ctx = await requireContext('students.view')
  const query = parseListQuery(params)
  const filter = studentListFilterSchema.parse(params)
  const { rows, total } = await listStudents(ctx, query, filter)

  return (
    <StudentTable
      rows={rows}
      total={total}
      page={query.page}
      pageSize={query.pageSize}
      sort={query.sort}
      dir={query.dir}
      currency={ctx.tenant.currency}
      canEdit={ctx.can('students.edit')}
      canCreate={ctx.can('students.create')}
    />
  )
}
