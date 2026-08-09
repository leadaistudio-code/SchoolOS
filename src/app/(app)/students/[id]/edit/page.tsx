import { formatDay } from '@/lib/dates'
import { requireContext } from '@/server/context'
import { getClassOptions, getStudent } from '@/server/modules/students/service'
import { PageHeader } from '@/components/page-header'
import { StudentForm } from '../../student-form'
import { updateStudentAction } from '../../actions'
import { fullName } from '@/lib/utils'

export const metadata = { title: 'Edit student' }

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireContext('students.edit')
  const [student, classes] = await Promise.all([getStudent(ctx, id), getClassOptions(ctx)])

  const current = student.enrollments.find((e) => e.isCurrent)
  const action = updateStudentAction.bind(null, id)

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`Edit ${fullName(student)}`}
        description={`Admission no. ${student.admissionNo}`}
      />
      <StudentForm
        action={action}
        classes={classes}
        mode="edit"
        cancelHref={`/students/${id}`}
        values={{
          admissionNo: student.admissionNo,
          firstName: student.firstName,
          lastName: student.lastName,
          dateOfBirth: student.dateOfBirth ? formatDay(student.dateOfBirth, 'yyyy-MM-dd') : undefined,
          gender: student.gender ?? undefined,
          bloodGroup: student.bloodGroup ?? undefined,
          category: student.category ?? undefined,
          admissionDate: student.admissionDate
            ? formatDay(student.admissionDate, 'yyyy-MM-dd')
            : undefined,
          previousSchool: student.previousSchool ?? undefined,
          classLevelId: current?.classLevelId,
          sectionId: current?.sectionId,
          rollNumber: current?.rollNumber,
          addressLine1: student.addressLine1 ?? undefined,
          addressLine2: student.addressLine2 ?? undefined,
          city: student.city ?? undefined,
          state: student.state ?? undefined,
          postalCode: student.postalCode ?? undefined,
          emergencyContactName: student.emergencyContactName ?? undefined,
          emergencyContactPhone: student.emergencyContactPhone ?? undefined,
          medicalNotes: student.medicalNotes ?? undefined,
          allergies: student.allergies ?? undefined,
          status: student.status,
        }}
      />
    </div>
  )
}
