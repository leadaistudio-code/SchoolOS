import { requireContext } from '@/server/context'
import { getClassOptions, suggestAdmissionNumber } from '@/server/modules/students/service'
import { PageHeader } from '@/components/page-header'
import { StudentForm } from '../student-form'
import { createStudentAction } from '../actions'

export const metadata = { title: 'New admission' }

export default async function NewStudentPage() {
  const ctx = await requireContext('students.create')
  const [classes, suggestedAdmissionNo] = await Promise.all([
    getClassOptions(ctx),
    suggestAdmissionNumber(ctx),
  ])

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="New admission"
        description="Admission number is generated for you. Fill the top block, then the tabs below as the family provides details."
      />
      <StudentForm
        action={createStudentAction}
        classes={classes}
        mode="create"
        cancelHref="/students"
        suggestedAdmissionNo={suggestedAdmissionNo}
      />
    </div>
  )
}
