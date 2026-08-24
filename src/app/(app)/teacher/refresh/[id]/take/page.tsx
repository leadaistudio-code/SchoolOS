import Link from 'next/link'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { getMyRefresherForTaking } from '@/server/modules/teacher-refresh/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { TakeFlow } from './take-flow'

export const metadata = { title: 'Knowledge refresh' }

const BACK = (
  <Link href="/teacher/refresh" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
    Back to my refreshers
  </Link>
)

/**
 * Taking one refresher.
 *
 * A deliberately narrow, single-column page — this is the one screen a teacher
 * may open on a phone between lessons, so it drops the surrounding density and
 * shows one question at a time. Answer keys never reach this page: the service
 * strips them, and the teacher only sees what was right on the result screen.
 */
export default async function TakeRefresherPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('teacher_refresh.take')
  const { id } = await params

  let refresher: Awaited<ReturnType<typeof getMyRefresherForTaking>>
  try {
    refresher = await getMyRefresherForTaking(ctx, id)
  } catch (error) {
    if (error instanceof ApiException) {
      return (
        <div className="mx-auto max-w-2xl">
          <Card>
            <EmptyState
              title={error.code === 'NOT_TEACHING_STAFF' ? 'For teaching staff' : 'Refresher not found'}
              description={
                error.code === 'NOT_TEACHING_STAFF'
                  ? 'Knowledge refreshers are assigned to teaching staff.'
                  : 'This refresher may have been removed, or it isn’t yours.'
              }
              action={BACK}
            />
          </Card>
        </div>
      )
    }
    throw error
  }

  // Nothing left to do here: a finished or waived refresher sends the teacher
  // back rather than re-presenting questions that can no longer be submitted.
  if (refresher.status === 'COMPLETED' || refresher.status === 'EXEMPTED') {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <EmptyState
            title={refresher.status === 'COMPLETED' ? 'Already completed' : 'You’re exempt from this one'}
            description={
              refresher.status === 'COMPLETED'
                ? 'You’ve finished this refresher. Your knowledge profile reflects it.'
                : 'No need to take this — your school has waived it for you.'
            }
            action={BACK}
          />
        </Card>
      </div>
    )
  }

  if (refresher.attemptsUsed >= refresher.maxAttempts) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <EmptyState
            title="No attempts left"
            description="You’ve used the attempts for this refresher. It still counts as done."
            action={BACK}
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Knowledge refresh"
        description={`${refresher.subjectLabel} · ${refresher.className}`}
      />
      <TakeFlow
        refresher={{
          id: refresher.id,
          subjectLabel: refresher.subjectLabel,
          className: refresher.className,
          attemptsUsed: refresher.attemptsUsed,
          maxAttempts: refresher.maxAttempts,
          questions: refresher.questions,
        }}
      />
    </div>
  )
}
