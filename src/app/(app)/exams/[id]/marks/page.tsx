import { requireContext } from '@/server/context'
import { examMarksSetup, marksRoster } from '@/server/modules/exams/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { LinkTabs } from '@/components/ui/tabs'
import { MarksForm } from './marks-form'

export const metadata = { title: 'Marks entry' }

export default async function MarksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ subject?: string }>
}) {
  const ctx = await requireContext('exams.marks')
  const { id } = await params
  const { subject } = await searchParams
  const setup = await examMarksSetup(ctx, id)
  const selected = setup.subjects.find((item) => item.id === subject) ?? setup.subjects[0]

  if (!selected) {
    return (
      <div>
        <PageHeader
          title={setup.name}
          breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Marks' }]}
        />
        <Card>
          <EmptyState
            title="No papers available"
            description="Ask an administrator to add subjects to this examination."
          />
        </Card>
      </div>
    )
  }

  const roster = await marksRoster(ctx, id, selected.id)

  return (
    <div>
      <PageHeader
        title={setup.name}
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Marks' }]}
        description={`${roster.subject.name} · out of ${roster.maxMarks} · ${roster.rows.length} students`}
      />

      <LinkTabs
        label="Paper"
        className="mb-4"
        items={setup.subjects.map((item) => ({
          label: `${item.classSubject.classLevel.name} · ${item.classSubject.subject.name}`,
          href: `/exams/${id}/marks?subject=${item.id}`,
          active: item.id === selected.id,
        }))}
      />

      <MarksForm
        examId={id}
        examSubjectId={selected.id}
        maxMarks={roster.maxMarks}
        rows={roster.rows.map((row) => ({
          studentId: row.studentId,
          rollNumber: row.rollNumber,
          admissionNo: row.student.admissionNo,
          name: `${row.student.firstName} ${row.student.lastName}`,
          marksObtained: row.mark?.marksObtained ?? null,
          isAbsent: row.mark?.isAbsent ?? false,
          remarks: row.mark?.remarks ?? '',
        }))}
      />
    </div>
  )
}
