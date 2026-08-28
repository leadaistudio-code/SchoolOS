import Link from 'next/link'
import { Suspense } from 'react'
import { Plus, Upload } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listStudents, getClassOptions } from '@/server/modules/students/service'
import { studentListFilterSchema } from '@/server/modules/students/schema'
import { parseListQuery } from '@/lib/query'
import { formatNumber } from '@/lib/utils'
import { PageBanner } from '@/components/page-banner'
import { StatCard } from '@/components/dashboard/stat-card'
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

  const [activeCount, classCount, parentLinks] = await Promise.all([
    ctx.db.student.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    ctx.db.classLevel.count({ where: { deletedAt: null } }),
    ctx.db.studentGuardian.groupBy({
      by: ['studentId'],
      where: { student: { status: 'ACTIVE', deletedAt: null } },
    }),
  ])

  return (
    <div className="space-y-4">
      <PageBanner
        title="Students"
        description={`${formatNumber(activeCount)} active on roll across ${formatNumber(classCount)} classes`}
        tone="students"
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Active students"
          value={formatNumber(activeCount)}
          icon="Users"
          tone="students"
          sub="Currently enrolled"
          href="/students"
          delayMs={40}
        />
        <StatCard
          label="Classes"
          value={formatNumber(classCount)}
          icon="GraduationCap"
          tone="admissions"
          sub="Class levels in this session"
          href="/academics/classes"
          delayMs={80}
        />
        <StatCard
          label="With parent linked"
          value={formatNumber(parentLinks.length)}
          icon="HeartHandshake"
          tone="parents"
          sub="Primary guardian on file"
          href="/parents"
          delayMs={120}
        />
      </div>

      <Card variant="elevated" className="overflow-hidden">
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
