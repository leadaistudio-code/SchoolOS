import Link from 'next/link'
import { requireContext } from '@/server/context'
import { blueprintOf, getAssessment } from '@/server/modules/assessments/service'
import { ASSESSMENT_STATUS_LABEL, ASSESSMENT_STATUS_TONE } from '@/lib/assessments'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { PaperBuilder } from './builder'

export const metadata = { title: 'Paper' }

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('assessments.view')
  const assessment = await getAssessment(ctx, id)
  const blueprint = blueprintOf(assessment)

  const locked = assessment.status === 'ASSIGNED' || assessment.status === 'CLOSED'

  return (
    <div>
      <PageHeader
        title={assessment.title}
        description={`${assessment.classSubject.classLevel.name} · ${assessment.classSubject.subject.name} · ${assessment.type.name} · ${assessment.durationMinutes} minutes`}
        breadcrumbs={[{ label: 'Question papers', href: '/assessments' }, { label: assessment.title }]}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={ASSESSMENT_STATUS_TONE[assessment.status] ?? 'neutral'}>
              {ASSESSMENT_STATUS_LABEL[assessment.status] ?? assessment.status}
            </Badge>
            {assessment.setLabel && <Badge tone="neutral">Set {assessment.setLabel}</Badge>}
            {ctx.can('assessments.export') && (
              <Link
                href={`/assessments/${assessment.id}/print`}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Print
              </Link>
            )}
          </div>
        }
      />

      <PaperBuilder
        assessment={assessment}
        blueprint={blueprint}
        canEdit={ctx.can('assessments.edit') && !locked}
        canApprove={ctx.can('assessments.approve') && !locked}
        canCreate={ctx.can('assessments.create')}
      />
    </div>
  )
}
