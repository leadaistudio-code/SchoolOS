import { requireContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { TcTabs } from '../tc-tabs'
import { TcForm } from './tc-form'

export const metadata = { title: 'Issue transfer certificate' }

export default async function NewTransferCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>
}) {
  const ctx = await requireContext('students.tc')
  const { student: studentId } = await searchParams

  const initial = studentId
    ? await ctx.db.student.findFirst({
        where: { id: studentId, deletedAt: null },
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      })
    : null

  return (
    <div className="space-y-4">
      <PageHeader
        title="Issue transfer certificate"
        description="Pick the student, review the particulars pulled from the register, then issue. The TC prints in the CBSE format."
        actions={<BackButton fallbackHref="/students/transfer-certificates" />}
      />
      <TcTabs active="issue" />
      <TcForm
        initialStudent={
          initial
            ? {
                id: initial.id,
                admissionNo: initial.admissionNo,
                firstName: initial.firstName,
                lastName: initial.lastName,
                photoUrl: initial.photoUrl,
                className: initial.enrollments[0]?.classLevel.name ?? null,
                sectionName: initial.enrollments[0]?.section.name ?? null,
              }
            : null
        }
      />
    </div>
  )
}
