import { requireContext } from '@/server/context'
import { listCoverage } from '@/server/modules/curriculum/service'
import { assistantConfigured } from '@/server/assistant/providers'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { GenerateForm } from './generate-form'

export const metadata = { title: 'Generate questions' }

export default async function GeneratePage() {
  const ctx = await requireContext('questionbank.generate')
  const [coverage, licensed] = await Promise.all([
    listCoverage(ctx),
    hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST),
  ])

  const configured = assistantConfigured()
  const withSyllabus = coverage.filter((row) => row.curriculum?.isPublished)

  return (
    <div>
      <PageHeader
        title="Generate questions"
        description="Drafts, from your own syllabus — reviewed before anything reaches a paper"
        breadcrumbs={[
          { label: 'Assessments', href: '/assessments' },
          { label: 'Question bank', href: '/assessments/bank' },
          { label: 'Generate' },
        ]}
      />

      {!configured ? (
        <Card>
          <EmptyState
            title="Generation is switched off"
            description="An administrator sets AI_DRIVER and AI_API_KEY on the deployment before this can be used."
          />
        </Card>
      ) : !licensed ? (
        <Card>
          <EmptyState
            title="Not part of this plan"
            description="Question generation needs the AI module on your school's subscription."
          />
        </Card>
      ) : withSyllabus.length === 0 ? (
        <Card>
          <EmptyState
            title="No published syllabus yet"
            description="Questions are generated from the chapters and topics your school recorded, not from the subject name. Publish a syllabus first."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Notice tone="info" title="Everything generated arrives as a draft">
            Drafts do not appear in the paper builder and cannot be assigned. Read each one, then
            approve the ones worth keeping — the rest can simply be left.
          </Notice>

          <GenerateForm
            subjects={withSyllabus.map((row) => ({
              id: row.classSubjectId,
              label: `${row.classLevel.name} · ${row.subject.name}`,
            }))}
          />
        </div>
      )}
    </div>
  )
}
