import type { AppContext } from '@/server/context'

export type BulkPhotoPerson = {
  id: string
  identifier: string
  name: string
  photoUrl: string | null
}

/** Identifier directory used only to match local filenames before upload. */
export async function bulkPhotoUploadSetup(ctx: AppContext) {
  const canUploadStudents = ctx.can('students.edit')
  const canUploadStaff = ctx.can('staff.edit')
  if (!canUploadStudents && !canUploadStaff) ctx.require('students.edit')

  const [students, staff] = await Promise.all([
    canUploadStudents
      ? ctx.db.student.findMany({
          where: { deletedAt: null, status: 'ACTIVE' },
          orderBy: [{ admissionNo: 'asc' }],
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
          },
        })
      : Promise.resolve([]),
    canUploadStaff
      ? ctx.db.staff.findMany({
          where: { deletedAt: null, leftOn: null },
          orderBy: [{ employeeCode: 'asc' }],
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
          },
        })
      : Promise.resolve([]),
  ])

  return {
    canUploadStudents,
    canUploadStaff,
    students: students.map((student) => ({
      id: student.id,
      identifier: student.admissionNo,
      name: `${student.firstName} ${student.lastName}`.trim(),
      photoUrl: student.photoUrl,
    })) satisfies BulkPhotoPerson[],
    staff: staff.map((person) => ({
      id: person.id,
      identifier: person.employeeCode,
      name: `${person.firstName} ${person.lastName}`.trim(),
      photoUrl: person.photoUrl,
    })) satisfies BulkPhotoPerson[],
  }
}
