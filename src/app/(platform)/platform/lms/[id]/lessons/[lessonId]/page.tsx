import { notFound } from 'next/navigation'
import { requirePlatformContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { getLessonForEditing } from '@/server/modules/lms/content'
import { PageHeader } from '@/components/page-header'
import { LessonEditor } from '@/components/lms/lesson-editor'
import { blankLesson } from '@/lib/lms/options'
import { createLessonAction, updateLessonAction } from '../../../actions'

export const metadata = { title: 'Lesson · Platform' }

export default async function PlatformLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; lessonId: string }>
  searchParams: Promise<{ module?: string; t?: string }>
}) {
  await requirePlatformContext('platform.lms')
  const [{ id, lessonId }, query] = await Promise.all([params, searchParams])
  const isNew = lessonId === 'new'

  const found = isNew
    ? await prisma.lmsModule
        .findFirst({
          where: { id: query.module ?? '', courseId: id, tenantId: null, course: { deletedAt: null } },
          select: { id: true, title: true, course: { select: { id: true, title: true } } },
        })
        .then((m) => (m ? { lesson: null, module: m, course: m.course } : null))
    : await getLessonForEditing({ tenantId: null }, lessonId).catch(() => null)
  if (!found || found.course.id !== id) notFound()

  const back = `/platform/lms/${id}`
  return (
    <div className="space-y-4">
      <PageHeader
        title={found.lesson?.title ?? 'New lesson'}
        description={`${found.course.title} · ${found.module.title}`}
        breadcrumbs={[
          { label: 'Courses', href: '/platform/lms' },
          { label: found.course.title, href: back },
          { label: found.lesson ? 'Edit lesson' : 'New lesson' },
        ]}
      />
      <LessonEditor
        key={`${lessonId}-${query.t ?? ''}`}
        lesson={found.lesson ?? blankLesson()}
        courseId={id}
        moduleId={found.module.id}
        createLesson={createLessonAction}
        updateLesson={updateLessonAction}
        lessonPath="/platform/lms/:course/lessons/:lesson"
        backHref={back}
      />
    </div>
  )
}
