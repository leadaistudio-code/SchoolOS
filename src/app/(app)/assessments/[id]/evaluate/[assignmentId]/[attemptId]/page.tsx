import { requireContext } from '@/server/context'
import { attemptForMarking } from '@/server/modules/assessments/evaluation'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { MarkingSheet } from './marking-sheet'

export const metadata = { title: 'Marking' }

export default async function MarkAttemptPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string; attemptId: string }>
}) {
  const { id, assignmentId, attemptId } = await params
  const ctx = await requireContext('assessments.evaluate')
  const attempt = await attemptForMarking(ctx, attemptId)

  return (
    <div>
      <PageHeader
        title={`${attempt.student.firstName} ${attempt.student.lastName}`}
        description={`${attempt.assessment.title} · ${attempt.assessment.totalMarks} marks · admission ${attempt.student.admissionNo}`}
        breadcrumbs={[
          { label: 'Question papers', href: '/assessments' },
          { label: attempt.assessment.title, href: `/assessments/${id}` },
          { label: 'Attempts', href: `/assessments/${id}/evaluate/${assignmentId}` },
          { label: 'Marking' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {attempt.autoSubmitted && <Badge tone="warning">submitted by the timer</Badge>}
            <Badge tone={attempt.published ? 'success' : 'neutral'}>
              {attempt.published ? 'released' : 'not released'}
            </Badge>
          </div>
        }
      />

      <MarkingSheet attempt={attempt} />
    </div>
  )
}
