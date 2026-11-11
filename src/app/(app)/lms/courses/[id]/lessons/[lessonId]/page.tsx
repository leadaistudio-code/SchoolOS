import { notFound } from 'next/navigation'
import { prisma } from '@/server/db/prisma'
import { requireLms } from '@/server/modules/lms/access'
import { getLessonForEditing } from '@/server/modules/lms/content'
import { PageHeader } from '@/components/page-header'
import { LessonEditor } from '@/components/lms/lesson-editor'
import { blankLesson } from '@/lib/lms/options'
import { createLessonAction, updateLessonAction } from '../../../../actions'

export const metadata = { title: 'Lesson · Robotics & AI' }

export default async function SchoolLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; lessonId: string }>
  searchParams: Promise<{ module?: string; t?: string }>
}) {
  const ctx = await requireLms('lms.manage')
  const [{ id, lessonId }, query] = await Promise.all([params, searchParams])
  const owner = { tenantId: ctx.tenant.id }

  const found =
    lessonId === 'new'
      ? await prisma.lmsModule
          .findFirst({
            where: { id: query.module ?? '', courseId: id, tenantId: owner.tenantId, course: { deletedAt: null } },
            select: { id: true, title: true, course: { select: { id: true, title: true } } },
          })
          .then((m) => (m ? { lesson: null, module: m, course: m.course } : null))
      : await getLessonForEditing(owner, lessonId).catch(() => null)
  if (!found || found.course.id !== id) notFound()

  const back = `/lms/courses/${id}/edit`
  return (
    <div className="space-y-4">
      <PageHeader
        title={found.lesson?.title ?? 'New lesson'}
        description={`${found.course.title} · ${found.module.title}`}
        breadcrumbs={[
          { label: 'Robotics & AI', href: '/lms' },
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
        lessonPath="/lms/courses/:course/lessons/:lesson"
        backHref={back}
      />
    </div>
  )
}
