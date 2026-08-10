import { requireContext } from '@/server/context'
import { getClassOptions } from '@/server/modules/students/service'
import { PageHeader } from '@/components/page-header'
import { StudentForm } from '../student-form'
import { createStudentAction } from '../actions'

export const metadata = { title: 'Admit student' }

export default async function NewStudentPage() {
  const ctx = await requireContext('students.create')
  const classes = await getClassOptions(ctx)

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Admit a student"
      />
      <StudentForm
        action={createStudentAction}
        classes={classes}
        mode="create"
        cancelHref="/students"
      />
    </div>
  )
}
