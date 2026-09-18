import Link from 'next/link'
import { requireContext } from '@/server/context'
import {
  evaluationUsageSummary,
  listEvaluationJobs,
  listUploadTargets,
} from '@/server/modules/evaluation/service'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { SheetUploadForm } from './sheet-upload-form'

export const metadata = { title: 'AI Evaluation' }

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--fg)]">{value}</p>
    </div>
  )
}

export default async function AiEvaluationPage() {
  const ctx = await requireContext('assessments.evaluate')
  const licensed = await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)

  if (!licensed) {
    return (
      <div>
        <PageHeader title="AI Evaluation" />
        <Card>
          <EmptyState
            title="Not included in this plan"
            description="Enable AI Assist to queue handwritten answer-sheet evaluation."
          />
        </Card>
      </div>
    )
  }

  const [jobs, targets, usage] = await Promise.all([
    listEvaluationJobs(ctx),
    listUploadTargets(ctx),
    evaluationUsageSummary(ctx),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Evaluation"
        description="Upload scanned answer sheets. Jobs run in the background — AI suggests marks; you approve before publish."
        breadcrumbs={[
          { label: 'Assessments', href: '/assessments' },
          { label: 'Intelligence', href: '/assessments/intelligence' },
          { label: 'Evaluation' },
        ]}
        actions={
          <Link href="/assessments/usage" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            AI usage
          </Link>
        }
      />

      <Notice tone="info" title="Teacher remains the authority">
        AI never publishes marks automatically. Low-confidence extracts are flagged for review.
        Approve or override on the review desk, then finalise.
      </Notice>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Pages processed (month)"
          value={
            usage.pagesLimit == null
              ? usage.pagesThisMonth
              : `${usage.pagesThisMonth} / ${usage.pagesLimit}`
          }
        />
        <Stat label="Jobs this month" value={usage.jobsThisMonth} />
        <Stat label="Needs review" value={usage.reviewRequired} />
      </section>

      <SheetUploadForm
        initialTargets={targets.map((t) => ({
          ...t,
          dueAt: t.dueAt.toISOString(),
        }))}
      />

      <Card className="overflow-hidden">
        {jobs.length === 0 ? (
          <EmptyState
            title="No evaluation jobs yet"
            description="Upload a PDF or photo of an answer sheet for an assigned paper."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Paper</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const sheet = job.answerSheet
                  const student = sheet.student
                  return (
                    <tr key={job.id} className="border-b border-[var(--border)]">
                      <td className="px-4 py-3">
                        <Link
                          href={`/assessments/${sheet.assignment.assessment.id}`}
                          className="font-medium text-[var(--brand-600)] hover:underline"
                        >
                          {sheet.assignment.assessment.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {student.firstName} {student.lastName}
                        <span className="block text-xs text-[var(--muted)]">
                          {student.admissionNo}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {sheet.fileName}
                        <span className="block text-xs text-[var(--muted)]">
                          {sheet.pageCount} page{sheet.pageCount === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium">
                          {job.status.replaceAll('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {new Date(job.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/assessments/evaluation/${job.id}`}
                          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardContent className="py-4 text-sm text-[var(--muted)]">
          Prefer classic marking?{' '}
          <Link href="/assessments" className={buttonVariants({ variant: 'link' })}>
            Open question papers
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
