import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getEvaluationJob } from '@/server/modules/evaluation/service'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { EvaluationReviewDesk } from './review-desk'

export const metadata = { title: 'Evaluation review' }

export default async function EvaluationJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  const ctx = await requireContext('assessments.evaluate')
  const licensed = await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)

  if (!licensed) {
    return (
      <div>
        <PageHeader title="Evaluation review" />
        <Card>
          <EmptyState title="Not included in this plan" description="Enable AI Assist." />
        </Card>
      </div>
    )
  }

  const job = await getEvaluationJob(ctx, jobId)
  const sheet = job.answerSheet
  const assessment = sheet.assignment.assessment
  const student = sheet.student

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={`${assessment.title} · ${assessment.classSubject.classLevel.name} · ${assessment.classSubject.subject.name}`}
        breadcrumbs={[
          { label: 'Assessments', href: '/assessments' },
          { label: 'Evaluation', href: '/assessments/evaluation' },
          { label: 'Review' },
        ]}
        actions={
          <Link
            href={`/assessments/${assessment.id}/evaluate/${sheet.assignmentId}`}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            Classic marking
          </Link>
        }
      />

      <EvaluationReviewDesk
        jobId={job.id}
        status={job.status}
        sheetId={sheet.id}
        mimeType={sheet.mimeType}
        fileName={sheet.fileName}
        answers={job.answers}
        paperQuestions={assessment.questions}
        canRetry={job.status === 'FAILED' || job.status === 'REVIEW_REQUIRED'}
      />
    </div>
  )
}
