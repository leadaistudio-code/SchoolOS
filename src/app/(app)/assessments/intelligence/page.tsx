import Link from 'next/link'
import { requireContext } from '@/server/context'
import { intelligenceOverview } from '@/server/modules/ai-assessment/overview'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Academic Intelligence' }

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--fg)]">{value}</p>
      {hint ? <p className="mt-1 text-sm text-[var(--muted)]">{hint}</p> : null}
    </div>
  )
}

export default async function AcademicIntelligencePage() {
  const ctx = await requireContext('assessments.view')
  const licensed = await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)
  if (!licensed) {
    return (
      <div>
        <PageHeader title="Academic Intelligence" description="AI-powered assessment loop" />
        <Card>
          <EmptyState
            title="Not included in this plan"
            description="Ask your platform administrator to enable the AI Assist module for this school."
          />
        </Card>
      </div>
    )
  }

  const overview = await intelligenceOverview(ctx)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Intelligence"
        description="Create assessments with AI, evaluate answer sheets, and close the learning loop — on top of your existing question bank and papers."
        breadcrumbs={[{ label: 'Assessments', href: '/assessments' }, { label: 'Intelligence' }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {ctx.can('questionbank.generate') ? (
              <Link href="/assessments/ai/new" className={buttonVariants({ variant: 'primary' })}>
                Create AI assessment
              </Link>
            ) : null}
            {ctx.can('assessments.evaluate') ? (
              <Link
                href="/assessments/evaluation"
                className={buttonVariants({ variant: 'secondary' })}
              >
                AI Evaluation
              </Link>
            ) : null}
          </div>
        }
      />

      {!overview.aiConfigured ? (
        <Notice tone="warning" title="AI provider not configured">
          Set AI_DRIVER and AI_API_KEY on the deployment to generate questions. Answer-sheet upload
          and job queue still work without them.
        </Notice>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Papers this month" value={overview.papersThisMonth} />
        <Stat label="Drafts" value={overview.draftPapers} hint="Awaiting approve" />
        <Stat label="Open assignments" value={overview.assignmentsOpen} />
        <Stat
          label="Needs AI review"
          value={overview.evaluationReview}
          hint={overview.evaluationQueued ? `${overview.evaluationQueued} still processing` : undefined}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Teacher workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--muted)]">
            <ol className="list-decimal space-y-2 pl-5 text-[var(--fg)]">
              <li>Create an AI assessment (class → syllabus → generate)</li>
              <li>Review drafts and run the quality check</li>
              <li>Approve, assign (online / offline), or print</li>
              <li>Upload handwritten sheets for AI evaluation</li>
              <li>Approve suggested marks, then publish results</li>
            </ol>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link href="/assessments/bank/generate" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
                Generate questions
              </Link>
              <Link href="/assessments" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
                Question papers
              </Link>
              <Link href="/assessments/bank" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
                Question bank
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Stat
              label="Answer-sheet pages processed"
              value={overview.pagesProcessedThisMonth}
              hint="Usage tracking for cost control"
            />
            <p className="text-sm text-[var(--muted)]">
              Learning Insights and remedial tests build on existing assignment analytics. Vision OCR
              evaluation is queued asynchronously — marks are never auto-published.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/assessments/insights" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Open learning insights
              </Link>
              <Link href="/assessments/usage" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                View AI usage
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
