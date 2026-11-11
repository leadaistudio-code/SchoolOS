import Link from 'next/link'
import { ArrowRight, Award, Package, Video } from 'lucide-react'
import { requireLms } from '@/server/modules/lms/access'
import { learnerSummary } from '@/server/modules/lms/insights'
import { myKits } from '@/server/modules/lms/kits'
import { myCourses } from '@/server/modules/lms/learning'
import { isAcademy } from '@/server/modules/lms/academy-tenant'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { Metric } from '@/components/ui/metric'
import { EmptyState } from '@/components/ui/states'
import { CourseCard } from '@/components/lms/course-card'
import { formatIst } from '@/lib/ist-clock'

export const metadata = { title: 'My courses' }

export default async function MyLearningPage() {
  const ctx = await requireLms('lms.learn')
  const [{ learner, courses }, summary, kits] = await Promise.all([myCourses(ctx), learnerSummary(ctx), myKits(ctx)])
  const current = courses.find((c) => c.started && !c.completedAt)
  const finished = courses.filter((c) => c.completedAt).length
  const next = summary.nextClass
  const academy = isAcademy(ctx.tenant)

  return (
    <div className="space-y-4">
      <PageHeader
        title="My courses"
        description={`Robotics & AI · ${courses.length} course${courses.length === 1 ? '' : 's'}${finished ? ` · ${finished} finished` : ''}`}
        actions={academy ? <Link href="/academy" className={buttonVariants({ variant: 'secondary' })}>Browse courses</Link> : undefined}
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Metric label="Lessons done" value={String(summary.lessonsDone)} />
        <Metric label="Courses finished" value={String(finished)} sub={`of ${courses.length}`} />
        <Link href="/my/learning/certificates" className="lift block rounded-[var(--radius)]">
          <Metric label="Certificates" value={String(summary.certificates)} sub={summary.certificates ? 'View and print' : 'Finish a course to earn one'} />
        </Link>
        <Link href="/my/learning/live" className="lift block rounded-[var(--radius)]">
          <Metric
            label="Next live class"
            value={next ? (next.state === 'open' ? 'Live now' : formatIst(next.startsAt, 'EEE d MMM')) : '—'}
            sub={next ? `${next.title} · ${formatIst(next.startsAt, 'h:mm a')}` : 'None scheduled'}
          />
        </Link>
      </div>

      {next?.state === 'open' ? (
        <Card variant="elevated">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-subtle">Your live class has started</p>
              <p className="truncate text-lg font-semibold text-ink">{next.title}</p>
            </div>
            <Link href={`/my/learning/live/${next.id}/join`} className={buttonVariants({ size: 'lg' })}>
              <Video /> Join now
            </Link>
          </CardContent>
        </Card>
      ) : current ? (
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

      {kits.length ? (
        <Card>
          <CardContent className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Package className="size-4 text-ink-muted" aria-hidden /> Kits with you
            </p>
            <ul className="space-y-1.5">
              {kits.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-ink">
                    {k.quantity > 1 ? `${k.quantity} × ` : ''}
                    {k.kit.name}
                  </span>
                  <span className="text-ink-subtle">since {formatIst(k.issuedAt, 'd MMM')}</span>
                  {k.dueOn ? (
                    <Badge tone={k.overdue ? 'danger' : 'neutral'}>
                      {k.overdue ? 'Overdue, was due' : 'Return by'} {formatIst(k.dueOn, 'd MMM')}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {courses.length === 0 ? (
        <Card>
          {academy ? (
            <EmptyState
              title="No courses yet"
              description="Courses you join or buy appear here."
              action={<Link href="/academy" className={buttonVariants()}>Browse courses</Link>}
            />
          ) : (
            <EmptyState title="No courses yet" description="When your school opens a Robotics & AI course to your class, it will appear here." />
          )}
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
              badge={
                c.completedAt ? (
                  <Badge tone="success">
                    <Award className="size-3" aria-hidden /> Finished
                  </Badge>
                ) : !c.started ? (
                  <Badge tone="brand">New</Badge>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
