import { notFound } from 'next/navigation'
import { requirePlatformContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { PageHeader } from '@/components/page-header'
import { Notice } from '@/components/ui/states'
import { CourseOutline } from '@/components/lms/course-outline'
import { LessonPlayer } from '@/components/lms/lesson-player'
import { RichLesson } from '@/components/lms/robotics/rich-lesson'
import { lessonKind, publicQuiz, type Quiz } from '@/lib/lms/options'
import { readRichContent, videoForViewer } from '@/lib/lms/rich'
import { lessonResourcesFor, playerOptionsFor } from '@/lib/lms/curricula'
import { previewCatalogueQuizAction } from '../../../../actions'

export const metadata = { title: 'Preview lesson · Platform' }

export default async function PlatformLessonPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; lessonId: string }>
  searchParams: Promise<{ draft?: string }>
}) {
  await requirePlatformContext('platform.lms')
  const [{ id, lessonId }, query] = await Promise.all([params, searchParams])
  const course = await prisma.lmsCourse.findFirst({
    where: { id, tenantId: null, deletedAt: null },
    include: {
      modules: {
        orderBy: { position: 'asc' },
        include: { lessons: { where: { archivedAt: null }, orderBy: { position: 'asc' }, select: { id: true, title: true, kind: true, durationMinutes: true } } },
      },
    },
  })
  const lesson = course ? await prisma.lmsLesson.findFirst({ where: { id: lessonId, courseId: id, tenantId: null, archivedAt: null } }) : null
  if (!course || !lesson) notFound()

  const order = course.modules.flatMap((m) => m.lessons.map((l) => l.id))
  const at = order.indexOf(lesson.id)
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null
  const draft = query.draft === '1' && lesson.draftContent != null
  const { content, error } = readRichContent(draft ? lesson.draftContent : lesson.content)
  const { quiz, ...rest } = lesson
  const playerLesson = { ...rest, quiz: publicQuiz(quiz as Quiz | null) }
  const video = content ? videoForViewer(content.video, true) : null
  const href = (l: string) => `/platform/lms/${id}/lessons/${l}/preview${draft ? '?draft=1' : ''}`

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${at + 1}. ${lesson.title}`}
        description={`${lessonKind(lesson.kind).label}${lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ''} · version ${lesson.contentVersion}`}
        breadcrumbs={[
          { label: 'Courses', href: '/platform/lms' },
          { label: course.title, href: `/platform/lms/${id}` },
          { label: 'Edit lesson', href: `/platform/lms/${id}/lessons/${lesson.id}` },
          { label: 'Preview' },
        ]}
      />
      {draft ? (
        <Notice tone="warning" title="Unpublished draft">Students do not see this version yet. Nothing here is saved.</Notice>
      ) : (
        <Notice tone="info">Published version, as students see it (draft videos are shown to staff only). Nothing here is saved.</Notice>
      )}
      {error ? <Notice tone="danger" title="Content error">{error}</Notice> : null}
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Course outline" className="order-last lg:order-first lg:sticky lg:top-4 lg:self-start">
          <CourseOutline compact modules={course.modules} currentLessonId={lesson.id} lessonHref={href} />
        </nav>
        {content ? (
          <RichLesson
            key={`${lesson.id}-${draft}`}
            lesson={playerLesson}
            content={content}
            video={video}
            videoIsDraft={!!video && (video.status !== 'ready' || !video.src)}
            saved={{ state: {}, videoSeconds: 0, bestScorePercent: null }}
            completed={false}
            submitQuiz={previewCatalogueQuizAction.bind(null, lesson.id)}
            nextHref={next ? href(next) : null}
            finishHref={`/platform/lms/${id}`}
            preview
            resources={lessonResourcesFor(lesson.slug, { teacher: true })}
            courseTitle={course.title}
            player={playerOptionsFor(lesson.slug)}
          />
        ) : (
          <LessonPlayer
            key={lesson.id}
            lesson={playerLesson}
            completed={false}
            submitQuiz={previewCatalogueQuizAction.bind(null, lesson.id)}
            nextHref={next ? href(next) : null}
            finishHref={`/platform/lms/${id}`}
            preview
          />
        )}
      </div>
    </div>
  )
}
