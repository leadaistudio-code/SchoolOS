import { requireLms } from '@/server/modules/lms/access'
import { listCatalogue } from '@/server/modules/lms/school'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { LinkTabs } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/states'
import { CourseCard } from '@/components/lms/course-card'
import { NewCourseButton } from '@/components/lms/new-course-button'
import { LMS_CATEGORIES } from '@/lib/lms/options'
import { createCourseAction } from './actions'

export const metadata = { title: 'Robotics & AI courses' }

export default async function LmsCataloguePage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const ctx = await requireLms('lms.view')
  const [{ category }, courses] = await Promise.all([searchParams, listCatalogue(ctx)])
  const canManage = ctx.can('lms.manage')

  const used = LMS_CATEGORIES.filter((c) => courses.some((x) => x.category === c.value))
  const shown = category ? courses.filter((c) => c.category === category) : courses
  const catalogue = shown.filter((c) => !c.own)
  const own = shown.filter((c) => c.own)
  const open = courses.filter((c) => c.assignments > 0).length
  const learners = courses.reduce((s, c) => s + c.started, 0)

  const card = (c: (typeof courses)[number]) => (
    <CourseCard
      key={c.id}
      href={`/lms/courses/${c.id}`}
      title={c.title}
      subtitle={c.subtitle}
      category={c.category}
      level={c.level}
      gradeFrom={c.gradeFrom}
      gradeTo={c.gradeTo}
      lessons={c._count.lessons}
      badge={
        <>
          {c.own && c.status !== 'PUBLISHED' ? <StatusBadge status={c.status} /> : null}
          {c.assignments > 0 ? <Badge tone="success">Open to students</Badge> : null}
        </>
      }
      footer={c.started ? `${c.started} started · ${c.finished} finished` : c.assignments ? 'No one has started yet' : 'Not open to any class yet'}
    />
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Robotics & AI courses"
        description={`${courses.length} courses · ${open} open to students · ${learners} learners`}
        actions={canManage ? <NewCourseButton createCourse={createCourseAction} builderPath="/lms/courses/:id/edit" label="New school course" /> : null}
      />

      {used.length > 1 ? (
        <LinkTabs
          label="Category"
          items={[
            { label: 'All', href: '/lms', active: !category, count: courses.length },
            ...used.map((c) => ({
              label: c.label,
              href: `/lms?category=${c.value}`,
              active: category === c.value,
              accent: c.colour,
              count: courses.filter((x) => x.category === c.value).length,
            })),
          ]}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink">MyCampusView course library</h2>
        {catalogue.length === 0 ? (
          <Card>
            <EmptyState title="No library courses here yet" description="New courses from MyCampusView appear here as soon as they are published." />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{catalogue.map(card)}</div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink">Your school&apos;s courses</h2>
        {own.length === 0 ? (
          <Card>
            <EmptyState
              title="No school courses yet"
              description={
                canManage
                  ? 'Build your own course from videos, notes, code and quizzes. Only your school sees it.'
                  : 'Courses your school builds will appear here.'
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{own.map(card)}</div>
        )}
      </section>
    </div>
  )
}
