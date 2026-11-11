import { notFound } from 'next/navigation'
import { requireLms } from '@/server/modules/lms/access'
import { getCourseForEditing } from '@/server/modules/lms/content'
import { PageHeader } from '@/components/page-header'
import { CourseBuilder } from '@/components/lms/course-builder'
import * as actions from '../../../actions'

export const metadata = { title: 'Edit course · Robotics & AI' }

export default async function EditSchoolCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLms('lms.manage')
  const { id } = await params
  const course = await getCourseForEditing({ tenantId: ctx.tenant.id }, id).catch(() => null)
  if (!course) notFound()

  return (
    <div className="space-y-4">
      <PageHeader
        title={course.title}
        description="Your school's course · only your students can see it"
        breadcrumbs={[
          { label: 'Robotics & AI', href: '/lms' },
          { label: course.title, href: `/lms/courses/${id}` },
          { label: 'Edit' },
        ]}
      />
      <CourseBuilder
        course={course}
        modules={course.modules}
        actions={{
          createCourse: actions.createCourseAction,
          updateCourse: actions.updateCourseAction,
          setCourseStatus: actions.setCourseStatusAction,
          deleteCourse: actions.deleteCourseAction,
          addModule: actions.addModuleAction,
          renameModule: actions.renameModuleAction,
          moveModule: actions.moveModuleAction,
          deleteModule: actions.deleteModuleAction,
          createLesson: actions.createLessonAction,
          updateLesson: actions.updateLessonAction,
          moveLesson: actions.moveLessonAction,
          deleteLesson: actions.deleteLessonAction,
        }}
        paths={{
          builder: '/lms/courses/:id/edit',
          lesson: '/lms/courses/:course/lessons/:lesson',
          list: '/lms',
          preview: '/lms/courses/:id',
        }}
      />
    </div>
  )
}
