import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Award, CheckCircle2, Clock, Layers, Video } from 'lucide-react'
import {
  academyCourse,
  academyVisitor,
  formatRupees,
  paymentMode,
  requireAcademyHost,
} from '@/server/modules/lms/academy'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { Notice } from '@/components/ui/states'
import { LessonText } from '@/components/lms/lesson-text'
import { KindIcon } from '@/components/lms/kind-icon'
import { gradeRange, lessonKind, lmsCategory, lmsLevelLabel } from '@/lib/lms/options'
import { BuyButton } from '../../buy-button'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireAcademyHost()
  const { id } = await params
  const course = await academyCourse(tenant.id, id)
  return { title: course?.title ?? 'Course', description: course?.subtitle ?? undefined }
}

export default async function AcademyCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireAcademyHost()
  const { id } = await params
  const [course, visitor] = await Promise.all([academyCourse(tenant.id, id), academyVisitor(tenant)])
  if (!course) notFound()

  const lessons = course.modules.flatMap((m) => m.lessons)
  const minutes = lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0)
  const category = lmsCategory(course.category)
  const grades = gradeRange(course.gradeFrom, course.gradeTo)
  const owned = visitor?.owned.has(course.id) ?? false
  const free = course.priceMinor === 0
  const here = `/academy/courses/${course.id}`

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <nav className="text-sm text-ink-muted mb-4">
        <Link href="/academy" className="hover:text-ink">Courses</Link> <span aria-hidden>/</span> {category.label}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5 order-2 lg:order-1">
          <div>
            <p className="text-sm font-semibold" style={{ color: category.colour }}>
              {category.label} · {lmsLevelLabel(course.level)}
              {grades ? ` · ${grades}` : ''}
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-ink text-balance">{course.title}</h1>
            {course.subtitle ? <p className="mt-2 text-lg text-ink-muted">{course.subtitle}</p> : null}
          </div>

          {course.outcomes.length ? (
            <Card>
              <CardHeader>
                <CardTitle>What you will learn</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {course.outcomes.map((o) => (
                    <li key={o} className="flex gap-2 text-sm text-ink">
                      <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-success" aria-hidden />
                      {o}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {course.description ? (
            <Card>
              <CardHeader>
                <CardTitle>About the course</CardTitle>
              </CardHeader>
              <CardContent>
                <LessonText text={course.description} />
              </CardContent>
            </Card>
          ) : null}

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-ink">Course content</h2>
            {course.modules.map((m, mi) => (
              <Card key={m.id}>
                <CardHeader>
                  <CardTitle>
                    <span className="text-ink-subtle font-normal mr-1.5">{mi + 1}.</span>
                    {m.title}
                  </CardTitle>
                </CardHeader>
                <ul className="divide-y divide-[var(--border)]">
                  {m.lessons.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <KindIcon kind={l.kind} className="text-ink-subtle" />
                      <span className="flex-1 min-w-0 truncate text-ink">{l.title}</span>
                      <span className="text-xs text-ink-subtle whitespace-nowrap">
                        {lessonKind(l.kind).label}
                        {l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>

        <aside className="order-1 lg:order-2 lg:sticky lg:top-20 self-start">
          <Card variant="elevated">
            <CardContent className="space-y-4">
              <p className="text-3xl font-semibold text-ink tnum">{free ? 'Free' : formatRupees(course.priceMinor)}</p>
              <ul className="space-y-1.5 text-sm text-ink-muted">
                <li className="flex items-center gap-2"><Layers className="size-4" aria-hidden /> {course.modules.length} modules · {lessons.length} lessons</li>
                {minutes ? <li className="flex items-center gap-2"><Clock className="size-4" aria-hidden /> {minutes < 120 ? `${minutes} min` : `About ${Math.round(minutes / 60)} hours`} of lessons</li> : null}
                {course.hasLiveClasses ? <li className="flex items-center gap-2"><Video className="size-4" aria-hidden /> Live online classes included</li> : null}
                <li className="flex items-center gap-2"><Award className="size-4" aria-hidden /> Certificate when you finish</li>
              </ul>

              {owned ? (
                <Link href={`/my/learning/${course.id}`} className={buttonVariants({ block: true, size: 'lg' })}>
                  Go to the course <ArrowRight />
                </Link>
              ) : visitor?.isLearner ? (
                paymentMode() === 'off' && !free ? (
                  <Notice tone="warning">Online payments open soon. Please check back shortly.</Notice>
                ) : (
                  <BuyButton courseId={course.id} label={free ? 'Enrol for free' : `Buy for ${formatRupees(course.priceMinor)}`} simulated={paymentMode() === 'simulated'} />
                )
              ) : visitor ? (
                <Notice tone="info">This account is not a learner account. Sign in with your Academy account to enrol.</Notice>
              ) : (
                <div className="space-y-2">
                  <Link href={`/academy/join?next=${encodeURIComponent(here)}`} className={buttonVariants({ block: true, size: 'lg' })}>
                    {free ? 'Join free to start' : 'Create an account to buy'}
                  </Link>
                  <Link href={`/login?next=${encodeURIComponent(here)}`} className={buttonVariants({ block: true, variant: 'secondary' })}>
                    I already have an account
                  </Link>
                </div>
              )}
              {!free && !owned ? (
                <p className="text-xs text-ink-subtle">Pay with UPI, card, net banking or wallet. Pay once; the course stays in your account.</p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
