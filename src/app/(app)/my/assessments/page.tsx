import Link from 'next/link'
import { requireContext } from '@/server/context'
import { myAssessments } from '@/server/modules/assessments/attempts'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatDay } from '@/lib/dates'

export const metadata = { title: 'My assessments' }

const STATE = {
  available: { label: 'Available now', tone: 'success' as const },
  in_progress: { label: 'In progress', tone: 'warning' as const },
  upcoming: { label: 'Upcoming', tone: 'info' as const },
  completed: { label: 'Completed', tone: 'neutral' as const },
  missed: { label: 'Missed', tone: 'neutral' as const },
}

/**
 * The student's list.
 *
 * Ordered by what they can do about it: what is open now, then what is coming,
 * then what is done. A list sorted by date alone buries the one test that
 * closes this afternoon under three that closed last month.
 */
export default async function MyAssessmentsPage() {
  const ctx = await requireContext('assessments.attempt')
  const rows = await myAssessments(ctx)

  const order = ['in_progress', 'available', 'upcoming', 'completed', 'missed']
  const sorted = [...rows].sort(
    (a, b) => order.indexOf(a.state) - order.indexOf(b.state) || +a.dueAt - +b.dueAt,
  )

  return (
    <div>
      <PageHeader title="My assessments" description={`${rows.length} in total`} />

      {sorted.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing set yet"
            description="Tests your teachers assign will appear here."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((row) => {
            const state = STATE[row.state as keyof typeof STATE] ?? STATE.upcoming
            return (
              <Card key={row.assignmentId}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{row.title}</span>
                      <Badge tone={state.tone}>{state.label}</Badge>
                      {row.mode === 'OFFLINE' && <Badge tone="neutral">on paper</Badge>}
                      {row.mode === 'PRACTICE' && <Badge tone="info">practice</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {row.subject} · {row.type} · {row.totalMarks} marks · {row.minutes} minutes
                    </p>
                    <p className="mt-0.5 text-sm text-ink-subtle">
                      {row.state === 'upcoming'
                        ? `Opens ${formatDay(row.opensAt, 'd MMM, h:mm a')}`
                        : `Closes ${formatDay(row.dueAt, 'd MMM, h:mm a')}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {row.score !== null && (
                      <span className="text-sm tnum text-ink">
                        {row.score} / {row.totalMarks}
                      </span>
                    )}
                    {row.canStart && (
                      <Link
                        href={`/my/assessments/${row.assignmentId}/attempt`}
                        className={buttonVariants({ variant: 'primary', size: 'sm' })}
                      >
                        {row.attemptId ? 'Resume' : 'Start'}
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
