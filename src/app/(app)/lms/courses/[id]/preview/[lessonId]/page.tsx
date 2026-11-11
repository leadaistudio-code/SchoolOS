import { notFound } from 'next/navigation'
import { requireLms } from '@/server/modules/lms/access'
import { visibleCourse } from '@/server/modules/lms/school'
import { PageHeader } from '@/components/page-header'
import { Notice } from '@/components/ui/states'
import { CourseOutline } from '@/components/lms/course-outline'
import { LessonPlayer } from '@/components/lms/lesson-player'
import { RichLesson } from '@/components/lms/robotics/rich-lesson'
import { lessonKind, publicQuiz, type Quiz } from '@/lib/lms/options'
import { readRichContent, videoForViewer } from '@/lib/lms/rich'
import { lessonResourcesFor, playerOptionsFor } from '@/lib/lms/curricula'
import { previewLessonChatAction, previewQuizAction } from '../../../../actions'

export const metadata = { title: 'Preview · Robotics & AI' }

export default async function PreviewLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; lessonId: string }>
  searchParams: Promise<{ draft?: string }>
}) {
  const ctx = await requireLms('lms.view')
  const { id, lessonId } = await params
  const showDraft = (await searchParams).draft === '1'
  const course = await visibleCourse(ctx, id).catch(() => null)
  if (!course) notFound()
  const lesson = await ctx.db.lmsLesson.findFirst({ where: { id: lessonId, courseId: course.id, archivedAt: null } })
  if (!lesson) notFound()

  const order = course.modules.flatMap((m) => m.lessons.map((l) => l.id))
  const at = order.indexOf(lessonId)
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null
  const { quiz, ...rest } = lesson
  const playerLesson = { ...rest, quiz: publicQuiz(quiz as Quiz | null) }
  const draft = showDraft && lesson.draftContent != null
  const { content, error } = readRichContent(draft ? lesson.draftContent : lesson.content)
  const video = content ? videoForViewer(content.video, true) : null
  const outline = (
    <CourseOutline compact modules={course.modules} currentLessonId={lesson.id} lessonHref={(l) => `/lms/courses/${id}/preview/${l}`} />
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title={content ? `${at + 1}. ${lesson.title}` : lesson.title}
        description={`${lessonKind(lesson.kind).label}${lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ''} · lesson ${at + 1} of ${order.length}`}
        breadcrumbs={[
          { label: 'Robotics & AI', href: '/lms' },
          { label: course.title, href: `/lms/courses/${id}` },
          { label: 'Preview' },
        ]}
      />
      {draft ? (
        <Notice tone="warning" title="Unpublished draft">
          Students do not see this version yet. Nothing you do here is saved.
        </Notice>
      ) : (
        <Notice tone="info">You are previewing what students see. Nothing you do here is saved.</Notice>
      )}
      {error ? (
        <Notice tone="warning" title="This lesson's interactive content has an error">
          {error}. Students see the plain lesson until it is fixed.
        </Notice>
      ) : null}
      {content ? (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Course outline" className="order-last lg:order-first lg:sticky lg:top-4 lg:self-start">
            {outline}
          </nav>
          <RichLesson
            key={lesson.id}
            lesson={playerLesson}
            content={content}
            video={video}
            videoIsDraft={!!video && (video.status !== 'ready' || !video.src)}
            saved={{ state: {}, videoSeconds: 0, bestScorePercent: null }}
            completed={false}
            submitQuiz={previewQuizAction.bind(null, id, lesson.id)}
            nextHref={next ? `/lms/courses/${id}/preview/${next}` : null}
            finishHref={`/lms/courses/${id}`}
            preview
            resources={lessonResourcesFor(lesson.slug, { teacher: true })}
            courseTitle={course.title}
            player={playerOptionsFor(lesson.slug)}
            askAi={previewLessonChatAction.bind(null, id, lesson.id)}
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <LessonPlayer
            key={lesson.id}
            lesson={playerLesson}
            completed={false}
            submitQuiz={previewQuizAction.bind(null, id, lesson.id)}
            nextHref={next ? `/lms/courses/${id}/preview/${next}` : null}
            finishHref={`/lms/courses/${id}`}
            preview
          />
          <aside className="lg:sticky lg:top-4 self-start">{outline}</aside>
        </div>
      )}
    </div>
  )
}
