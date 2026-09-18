import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { getAssignmentForRespondent } from '@/server/modules/feedback/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { FeedbackForm } from '../../feedback-form'

export const metadata = { title: 'Give feedback' }

export default async function RespondPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('feedback.submit')
  const { id } = await params
  const assignment = await getAssignmentForRespondent(ctx, id)
  if (!assignment) notFound()

  const alreadySubmitted = assignment.status === 'SUBMITTED'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Give feedback"
        description={`${assignment.subject?.name ?? 'Your class'} · about two minutes`}
        breadcrumbs={[
          { label: 'Feedback', href: '/feedback' },
          { label: 'Give feedback' },
        ]}
      />
      <Card variant="elevated">
        <CardContent className="p-5 sm:p-6">
          {alreadySubmitted ? (
            <div className="rounded-[var(--radius)] border border-line bg-surface p-6 text-center">
              <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden />
              <h2 className="mt-3 text-lg font-semibold text-ink">Thank you for sharing.</h2>
              <p className="mt-1 text-sm text-ink-muted">
                This feedback form has already been submitted.
              </p>
              <Link
                href="/feedback"
                className={buttonVariants({ size: 'sm', variant: 'secondary', className: 'mt-4' })}
              >
                Back to feedback
              </Link>
            </div>
          ) : (
            <FeedbackForm assignment={assignment} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
