import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { requireLms } from '@/server/modules/lms/access'
import { myCourses } from '@/server/modules/lms/learning'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState } from '@/components/ui/states'
import { CourseCard } from '@/components/lms/course-card'

export const metadata = { title: 'My courses' }

export default async function MyLearningPage() {
  const ctx = await requireLms('lms.learn')
  const { learner, courses } = await myCourses(ctx)
  const current = courses.find((c) => c.started && !c.completedAt)
  const finished = courses.filter((c) => c.completedAt).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="My courses"
        description={`Robotics & AI · ${courses.length} course${courses.length === 1 ? '' : 's'}${finished ? ` · ${finished} finished` : ''}`}
      />

      {current ? (
        <Card variant="elevated">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-subtle">Pick up where you left off, {learner.firstName}</p>
              <p className="truncate text-lg font-semibold text-ink">{current.title}</p>
              <p className="text-sm text-ink-muted">
                {current.completed} of {current.lessons} lessons done
              </p>
            </div>
            <Link
              href={current.resumeLessonId ? `/my/learning/${current.id}/${current.resumeLessonId}` : `/my/learning/${current.id}`}
              className={buttonVariants({ size: 'lg' })}
            >
              Continue <ArrowRight />
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {courses.length === 0 ? (
        <Card>
          <EmptyState title="No courses yet" description="When your school opens a Robotics & AI course to your class, it will appear here." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              href={`/my/learning/${c.id}`}
              title={c.title}
              subtitle={c.subtitle}
              category={c.category}
              level={c.level}
              lessons={c.lessons}
              minutes={c.minutes}
              percent={c.started ? c.percent : undefined}
              badge={c.completedAt ? <Badge tone="success">Finished</Badge> : !c.started ? <Badge tone="brand">New</Badge> : null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
