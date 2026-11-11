import { notFound } from 'next/navigation'
import { requireLms } from '@/server/modules/lms/access'
import { visibleCourse } from '@/server/modules/lms/school'
import { PageHeader } from '@/components/page-header'
import { Notice } from '@/components/ui/states'
import { CourseOutline } from '@/components/lms/course-outline'
import { LessonPlayer } from '@/components/lms/lesson-player'
import { lessonKind, publicQuiz, type Quiz } from '@/lib/lms/options'
import { previewQuizAction } from '../../../../actions'

export const metadata = { title: 'Preview · Robotics & AI' }

export default async function PreviewLessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const ctx = await requireLms('lms.view')
  const { id, lessonId } = await params
  const course = await visibleCourse(ctx, id).catch(() => null)
  if (!course) notFound()
  const lesson = await ctx.db.lmsLesson.findFirst({ where: { id: lessonId, courseId: course.id } })
  if (!lesson) notFound()

  const order = course.modules.flatMap((m) => m.lessons.map((l) => l.id))
  const at = order.indexOf(lessonId)
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null
  const { quiz, ...rest } = lesson

  return (
    <div className="space-y-4">
      <PageHeader
        title={lesson.title}
        description={`${lessonKind(lesson.kind).label}${lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ''} · lesson ${at + 1} of ${order.length}`}
        breadcrumbs={[
          { label: 'Robotics & AI', href: '/lms' },
          { label: course.title, href: `/lms/courses/${id}` },
          { label: 'Preview' },
        ]}
      />
      <Notice tone="info">You are previewing what students see. Nothing you do here is saved.</Notice>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <LessonPlayer
          key={lesson.id}
          lesson={{ ...rest, quiz: publicQuiz(quiz as Quiz | null) }}
          completed={false}
          submitQuiz={previewQuizAction.bind(null, id, lesson.id)}
          nextHref={next ? `/lms/courses/${id}/preview/${next}` : null}
          finishHref={`/lms/courses/${id}`}
          preview
        />
        <aside className="lg:sticky lg:top-4 self-start">
          <CourseOutline
            compact
            modules={course.modules}
            currentLessonId={lesson.id}
            lessonHref={(l) => `/lms/courses/${id}/preview/${l}`}
          />
        </aside>
      </div>
    </div>
  )
}
