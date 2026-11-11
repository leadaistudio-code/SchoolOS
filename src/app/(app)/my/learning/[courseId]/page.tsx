import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Award } from 'lucide-react'
import { ApiException } from '@/server/api/response'
import { requireLms } from '@/server/modules/lms/access'
import { issueCertificateFor } from '@/server/modules/lms/certificates'
import { courseForLearner } from '@/server/modules/lms/learning'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { Progress } from '@/components/ui/progress'
import { Notice } from '@/components/ui/states'
import { CourseOutline } from '@/components/lms/course-outline'
import { LessonText } from '@/components/lms/lesson-text'
import { BadgeShelf } from '@/components/lms/robotics/badge-shelf'
import { gradeRange, lmsCategory, lmsLevelLabel } from '@/lib/lms/options'
import { isRobotics101 } from '@/lib/lms/robotics101'

export const metadata = { title: 'Course' }

export default async function LearnerCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const ctx = await requireLms('lms.learn')
  const { courseId } = await params
  const data = await courseForLearner(ctx, courseId).catch((err) => {
    if (err instanceof ApiException && (err.status === 404 || err.status === 403)) return null
    throw err
  })
  if (!data) notFound()
  const { course, completed, scores, percent, resumeLessonId, enrollment } = data
  const lessons = course.modules.flatMap((m) => m.lessons)
  const minutes = lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0)
  const category = lmsCategory(course.category)
  const grades = gradeRange(course.gradeFrom, course.gradeTo)
  const doneCount = lessons.filter((l) => completed.has(l.id)).length
  const certificate = enrollment.completedAt ? await issueCertificateFor(ctx, enrollment.id) : null
  const robotics = isRobotics101(lessons.map((l) => l.slug))
  const completedSlugs = new Set(lessons.filter((l) => completed.has(l.id) && l.slug).map((l) => l.slug!))

  return (
    <div className="space-y-4">
      <PageHeader
        title={course.title}
        description={`${category.label} · ${lmsLevelLabel(course.level)}${grades ? ` · ${grades}` : ''} · ${lessons.length} lessons${minutes ? ` · about ${minutes} min` : ''}`}
        breadcrumbs={[{ label: 'My courses', href: '/my/learning' }, { label: course.title }]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4 order-2 lg:order-1">
          {course.subtitle || course.description || course.outcomes.length ? (
            <Card>
              <CardContent className="space-y-3">
                {course.subtitle ? <p className="text-base font-medium text-ink">{course.subtitle}</p> : null}
                {course.description ? <LessonText text={course.description} /> : null}
                {course.outcomes.length ? (
                  <div>
                    <p className="text-sm font-semibold text-ink">You will learn to</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink">
                      {course.outcomes.map((o) => <li key={o}>{o}</li>)}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <CourseOutline
            modules={course.modules}
            completed={completed}
            scores={scores}
            lessonHref={(lessonId) => `/my/learning/${course.id}/${lessonId}`}
          />
        </div>

        <aside className="min-w-0 order-1 lg:order-2 lg:sticky lg:top-4 self-start">
          <Card variant="elevated">
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Progress value={percent} tone={enrollment.completedAt ? 'success' : 'brand'} />
                <span className="text-sm font-semibold tnum">{percent}%</span>
              </div>
              <p className="text-sm text-ink-muted">
                {doneCount} of {lessons.length} lessons done
              </p>
              {enrollment.completedAt ? (
                <Notice tone="success" title="Course complete">Well done! You can go back over any lesson.</Notice>
              ) : null}
              {certificate && !certificate.revokedAt ? (
                <Link href={`/my/learning/certificates/${certificate.id}`} className={buttonVariants({ block: true, variant: 'subtle' })}>
                  <Award /> View your certificate
                </Link>
              ) : null}
              {resumeLessonId ? (
                <Link href={`/my/learning/${course.id}/${resumeLessonId}`} className={buttonVariants({ block: true, size: 'lg' })}>
                  {doneCount === 0 ? 'Start the course' : enrollment.completedAt ? 'Review lessons' : 'Continue'} <ArrowRight />
                </Link>
              ) : null}
            </CardContent>
          </Card>
          {robotics ? (
            <Card className="mt-4">
              <CardContent>
                <BadgeShelf completedSlugs={completedSlugs} />
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
