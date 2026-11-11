import { notFound } from 'next/navigation'
import { ApiException } from '@/server/api/response'
import { requireLms } from '@/server/modules/lms/access'
import { lessonForLearner } from '@/server/modules/lms/learning'
import { PageHeader } from '@/components/page-header'
import { Progress } from '@/components/ui/progress'
import { CourseOutline } from '@/components/lms/course-outline'
import { LessonPlayer } from '@/components/lms/lesson-player'
import { RichLesson } from '@/components/lms/robotics/rich-lesson'
import { lessonKind } from '@/lib/lms/options'
import { readRichContent, videoForViewer } from '@/lib/lms/rich'
import { lessonResourcesFor, playerOptionsFor } from '@/lib/lms/curricula'
import { mySubmission } from '@/server/modules/lms/projects'
import {
  completeLessonAction,
  lessonChatAction,
  saveLessonStateAction,
  submitProjectAction,
  submitQuizAction,
  uploadProjectFileAction,
} from '../../../../lms/actions'

export const metadata = { title: 'Lesson' }

export default async function LearnerLessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const ctx = await requireLms('lms.learn')
  const { courseId, lessonId } = await params
  const data = await lessonForLearner(ctx, courseId, lessonId).catch((err) => {
    if (err instanceof ApiException && (err.status === 404 || err.status === 403)) return null
    throw err
  })
  if (!data) notFound()
  const { course, lesson, completed, scores, percent, nextLessonId, saved } = data
  const project = lesson.kind === 'PROJECT' ? await mySubmission(ctx, course.id, lesson.id) : null
  const order = course.modules.flatMap((m) => m.lessons.map((l) => l.id))
  const at = order.indexOf(lesson.id)
  const { content } = readRichContent(lesson.content)
  const nextHref = nextLessonId ? `/my/learning/${course.id}/${nextLessonId}` : null
  const finishHref = `/my/learning/${course.id}`

  const outline = (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Progress value={percent} tone={percent >= 100 ? 'success' : 'brand'} />
        <span className="text-xs font-semibold tnum">{percent}%</span>
      </div>
      <CourseOutline compact modules={course.modules} completed={completed} currentLessonId={lesson.id} lessonHref={(l) => `/my/learning/${course.id}/${l}`} />
    </div>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title={content ? `${at + 1}. ${lesson.title}` : lesson.title}
        description={`${lessonKind(lesson.kind).label}${lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ''} · lesson ${at + 1} of ${order.length}`}
        breadcrumbs={[
          { label: 'My courses', href: '/my/learning' },
          { label: course.title, href: `/my/learning/${course.id}` },
          { label: lesson.title },
        ]}
      />
      {content ? (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Course outline" className="order-last lg:order-first lg:sticky lg:top-4 lg:self-start">
            {outline}
          </nav>
          <RichLesson
            key={lesson.id}
            lesson={lesson}
            content={content}
            video={videoForViewer(content.video, false)}
            saved={saved}
            completed={completed.has(lesson.id)}
            markDone={completeLessonAction.bind(null, course.id, lesson.id)}
            submitQuiz={submitQuizAction.bind(null, course.id, lesson.id)}
            saveState={saveLessonStateAction.bind(null, course.id, lesson.id)}
            project={project}
            submitProject={submitProjectAction.bind(null, course.id, lesson.id)}
            uploadProjectFile={uploadProjectFileAction.bind(null, course.id, lesson.id)}
            nextHref={nextHref}
            finishHref={finishHref}
            resources={lessonResourcesFor(lesson.slug)}
            courseTitle={course.title}
            player={playerOptionsFor(lesson.slug)}
            askAi={lessonChatAction.bind(null, course.id, lesson.id)}
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <LessonPlayer
            key={lesson.id}
            lesson={lesson}
            completed={completed.has(lesson.id)}
            bestScore={scores.get(lesson.id) ?? null}
            markDone={completeLessonAction.bind(null, course.id, lesson.id)}
            submitQuiz={submitQuizAction.bind(null, course.id, lesson.id)}
            nextHref={nextHref}
            finishHref={finishHref}
            project={project}
            submitProject={submitProjectAction.bind(null, course.id, lesson.id)}
          />
          <aside className="lg:sticky lg:top-4 self-start">{outline}</aside>
        </div>
      )}
    </div>
  )
}
