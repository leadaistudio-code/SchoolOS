import Link from 'next/link'
import { Suspense } from 'react'
import { GraduationCap, HeartHandshake, Plus, Upload, Users } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listStudents, getClassOptions } from '@/server/modules/students/service'
import { studentListFilterSchema } from '@/server/modules/students/schema'
import { parseListQuery } from '@/lib/query'
import { cn, formatNumber } from '@/lib/utils'
import { ColorBanner, ColorTile } from '@/components/dashboard/color-tiles'
import { StudentsBannerScene } from '@/components/illustrations/school-scene'
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

  const withParent = parentLinks.length
  const withoutParent = Math.max(0, activeCount - withParent)

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="students"
        eyebrow="Students"
        title={
          activeCount > 0
            ? `${formatNumber(activeCount)} active on roll`
            : 'No students on roll yet'
        }
        description={
          activeCount > 0
            ? `Across ${formatNumber(classCount)} classes · ${formatNumber(withParent)} with a parent linked`
            : 'Admit the first student to start the roll.'
        }
        media={<StudentsBannerScene className="h-28 w-28" />}
        actions={
          <>
            {ctx.can('students.import') ? (
              <Link
                href="/students/import"
                className={cn(
                  buttonVariants({ variant: 'secondary', size: 'sm' }),
                  'border-white/30 bg-white/15 text-white hover:bg-white/25 hover:text-white',
                )}
              >
                <Upload aria-hidden />
                Import
              </Link>
            ) : null}
            {ctx.can('students.create') ? (
              <Link
                href="/students/new"
                className={cn(
                  buttonVariants({ size: 'sm' }),
                  'bg-white text-[var(--chart-students)] hover:bg-white/90',
                )}
              >
                <Plus aria-hidden />
                Add student
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Active students"
          value={formatNumber(activeCount)}
          sub="Currently enrolled"
          tone="students"
          href="/students"
          icon={<Users className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Classes"
          value={formatNumber(classCount)}
          sub="Class levels in this session"
          tone="admissions"
          href="/academics/classes"
          icon={<GraduationCap className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="With parent linked"
          value={formatNumber(withParent)}
          sub={
            withoutParent > 0
              ? `${formatNumber(withoutParent)} still need a guardian`
              : 'Primary guardian on file'
          }
          tone="parents"
          href="/parents"
          icon={<HeartHandshake className="size-5" aria-hidden />}
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
