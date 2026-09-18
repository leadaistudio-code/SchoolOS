import { requireContext } from '@/server/context'
import { listAssessmentTypes } from '@/server/modules/assessments/service'
import { listCoverage } from '@/server/modules/curriculum/service'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { assistantConfigured } from '@/server/assistant/providers'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { AiAssessmentWizard } from './wizard'

export const metadata = { title: 'AI Assessment' }

export default async function AiAssessmentNewPage() {
  const ctx = await requireContext('questionbank.generate')
  const [licensed, coverage, types] = await Promise.all([
    hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST),
    listCoverage(ctx),
    listAssessmentTypes(ctx),
  ])

  if (!licensed) {
    return (
      <div>
        <PageHeader title="AI Assessment" />
        <Card>
          <EmptyState
            title="Not included in this plan"
            description="Enable the AI Assist module to create assessments with AI."
          />
        </Card>
      </div>
    )
  }

  if (!assistantConfigured()) {
    return (
      <div>
        <PageHeader
          title="AI Assessment"
          breadcrumbs={[
            { label: 'Assessments', href: '/assessments' },
            { label: 'Intelligence', href: '/assessments/intelligence' },
            { label: 'New' },
          ]}
        />
        <Card>
          <EmptyState
            title="AI generation is not configured"
            description="An administrator must set AI_DRIVER and AI_API_KEY before questions can be generated."
          />
        </Card>
      </div>
    )
  }

  if (coverage.length === 0) {
    return (
      <div>
        <PageHeader title="AI Assessment" />
        <Card>
          <EmptyState
            title="No subjects assigned"
            description="Assign a class and subject in Academics before creating an AI assessment."
          />
        </Card>
      </div>
    )
  }

  const classLevelIds = [...new Set(coverage.map((row) => row.classLevel.id))]
  const sections = await ctx.db.section.findMany({
    where: { classLevelId: { in: classLevelIds }, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, classLevelId: true },
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Create AI assessment"
        description="Class → syllabus → type → difficulty mix → generate. Uses your existing question bank."
        breadcrumbs={[
          { label: 'Assessments', href: '/assessments' },
          { label: 'Intelligence', href: '/assessments/intelligence' },
          { label: 'New' },
        ]}
      />
      <AiAssessmentWizard
        subjects={coverage.map((row) => ({
          id: row.classSubjectId,
          label: `${row.classLevel.name} · ${row.subject.name}`,
          hasSyllabus: Boolean(row.curriculum?.isPublished),
          classLevelId: row.classLevel.id,
        }))}
        types={types.map((type) => ({
          id: type.id,
          name: type.name,
          marks: type.marks,
          minutes: type.minutes,
        }))}
        sections={sections}
      />
    </div>
  )
}
