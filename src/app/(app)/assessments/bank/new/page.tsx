import { requireContext } from '@/server/context'
import { listCoverage } from '@/server/modules/curriculum/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { QuestionForm } from './question-form'

export const metadata = { title: 'New question' }

export default async function NewQuestionPage() {
  const ctx = await requireContext('questionbank.create')
  const coverage = await listCoverage(ctx)

  return (
    <div>
      <PageHeader
        title="New question"
        description="Added to the bank, ready to place in a paper"
        breadcrumbs={[
          { label: 'Assessments', href: '/assessments/bank' },
          { label: 'Question bank', href: '/assessments/bank' },
          { label: 'New' },
        ]}
      />

      {coverage.length === 0 ? (
        <Card>
          <EmptyState
            title="No subjects assigned to you"
            description="Questions are filed against a class and subject. Ask an administrator to assign yours in Academics."
          />
        </Card>
      ) : (
        <QuestionForm
          subjects={coverage.map((row) => ({
            id: row.classSubjectId,
            label: `${row.classLevel.name} · ${row.subject.name}`,
            hasSyllabus: Boolean(row.curriculum),
          }))}
        />
      )}
    </div>
  )
}
