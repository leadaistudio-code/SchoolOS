import Link from 'next/link'
import { ChartColumn, Store } from 'lucide-react'
import { requirePlatformContext } from '@/server/context'
import { buttonVariants } from '@/components/ui/button-variants'
import { listOwnCourses } from '@/server/modules/lms/content'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { CourseCard } from '@/components/lms/course-card'
import { NewCourseButton } from '@/components/lms/new-course-button'
import { createCourseAction } from './actions'

export const metadata = { title: 'Courses · Platform' }

export default async function PlatformLmsPage() {
  const ctx = await requirePlatformContext('platform.lms')
  const courses = await listOwnCourses({ tenantId: null })
  const ids = courses.map((c) => c.id)
  const [learners, schools] = await Promise.all([
    ctx.db.lmsEnrollment.groupBy({ by: ['courseId'], where: { courseId: { in: ids } }, _count: { _all: true } }),
    ctx.db.lmsCourseAssignment.groupBy({ by: ['courseId', 'tenantId'], where: { courseId: { in: ids } } }),
  ])
  const learnerCount = new Map(learners.map((l) => [l.courseId, l._count._all]))
  const schoolCount = new Map<string, number>()
  for (const s of schools) schoolCount.set(s.courseId, (schoolCount.get(s.courseId) ?? 0) + 1)
  const published = courses.filter((c) => c.status === 'PUBLISHED').length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Robotics & AI courses"
        description={`${courses.length} course${courses.length === 1 ? '' : 's'} · ${published} published to every school with the add-on`}
        actions={
          <>
            <Link href="/platform/lms/usage" className={buttonVariants({ variant: 'secondary' })}>
              <ChartColumn /> Usage by school
            </Link>
            <Link href="/platform/lms/academy" className={buttonVariants({ variant: 'secondary' })}>
              <Store /> Academy
            </Link>
            <NewCourseButton createCourse={createCourseAction} builderPath="/platform/lms/:id" />
          </>
        }
      />
      {courses.length === 0 ? (
        <Card>
          <EmptyState
            title="No courses yet"
            description="Courses you publish here appear in the catalogue of every school that has the Robotics & AI add-on."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              href={`/platform/lms/${c.id}`}
              title={c.title}
              subtitle={c.subtitle}
              category={c.category}
              level={c.level}
              gradeFrom={c.gradeFrom}
              gradeTo={c.gradeTo}
              lessons={c._count.lessons}
              badge={<StatusBadge status={c.status} />}
              footer={`${schoolCount.get(c.id) ?? 0} school${schoolCount.get(c.id) === 1 ? '' : 's'} assigned · ${learnerCount.get(c.id) ?? 0} learners`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
