import { requireContext } from '@/server/context'
import { examSetup } from '@/server/modules/exams/service'
import { PageHeader } from '@/components/page-header'
import { ExamForm } from '../exam-form'
import { NewExamBulkUpload } from '../new-exam-bulk-upload'

export const metadata = { title: 'New examination' }

export default async function NewExamPage() {
  const ctx = await requireContext('exams.manage')
  const setup = await examSetup(ctx)

  return (
    <div>
      <PageHeader
        title="New examination"
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'New' }]}
        description={`Session ${setup.session.name}`}
      />
      <NewExamBulkUpload />
      <ExamForm classes={setup.classes} scales={setup.scales} />
    </div>
  )
}
