import { requireContext } from '@/server/context'
import { listAssessmentTypes } from '@/server/modules/assessments/service'
import { listCoverage } from '@/server/modules/curriculum/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { NewPaperForm } from './form'

export const metadata = { title: 'New paper' }

export default async function NewAssessmentPage() {
  const ctx = await requireContext('assessments.create')
  const [types, coverage] = await Promise.all([listAssessmentTypes(ctx), listCoverage(ctx)])

  return (
    <div>
      <PageHeader
        title="New question paper"
        description="Step 1 of 3 — what the paper is for"
        breadcrumbs={[{ label: 'Question papers', href: '/assessments' }, { label: 'New' }]}
      />

      {coverage.length === 0 ? (
        <Card>
          <EmptyState
            title="No subjects assigned to you"
            description="A paper is set for a class and subject. Ask an administrator to assign yours in Academics."
          />
        </Card>
      ) : (
        <NewPaperForm
          types={types.map((type) => ({
            id: type.id,
            name: type.name,
            marks: type.marks,
            minutes: type.minutes,
          }))}
          subjects={coverage.map((row) => ({
            id: row.classSubjectId,
            label: `${row.classLevel.name} · ${row.subject.name}`,
            hasSyllabus: Boolean(row.curriculum?.isPublished),
          }))}
        />
      )}
    </div>
  )
}
