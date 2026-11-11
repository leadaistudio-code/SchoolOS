import { notFound } from 'next/navigation'
import { requirePlatformContext } from '@/server/context'
import { getCourseForEditing } from '@/server/modules/lms/content'
import { PageHeader } from '@/components/page-header'
import { CourseBuilder } from '@/components/lms/course-builder'
import * as actions from '../actions'

export const metadata = { title: 'Course builder · Platform' }

export default async function PlatformCoursePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformContext('platform.lms')
  const { id } = await params
  const course = await getCourseForEditing({ tenantId: null }, id).catch(() => null)
  if (!course) notFound()

  return (
    <div className="space-y-4">
      <PageHeader
        title={course.title}
        description="MyCampusView catalogue course"
        breadcrumbs={[{ label: 'Courses', href: '/platform/lms' }, { label: course.title }]}
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
        paths={{ builder: '/platform/lms/:id', lesson: '/platform/lms/:course/lessons/:lesson', list: '/platform/lms' }}
      />
    </div>
  )
}
