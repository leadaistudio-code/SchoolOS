import Link from 'next/link'
import { AlertTriangle, ClipboardCheck } from 'lucide-react'
import type { courseLessonBreakdown } from '@/server/modules/lms/school'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { KindIcon } from '@/components/lms/kind-icon'

type Breakdown = Awaited<ReturnType<typeof courseLessonBreakdown>>

export function LessonBreakdown({ courseId, breakdown }: { courseId: string; breakdown: Breakdown }) {
  const { rows, attention, awaitingReview } = breakdown
  const reviewFor = new Map(awaitingReview.map((s) => [s.lessonId, s.id]))

  return (
    <div className="space-y-4">
      {attention.length || awaitingReview.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {attention.length ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <AlertTriangle className="mr-1.5 inline size-4 text-warning" aria-hidden />
                  Needs a nudge
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-line text-sm">
                  {attention.slice(0, 12).map((a, i) => (
                    <li key={`${a.studentId}-${i}`} className="flex justify-between gap-3 py-1.5">
                      <span className="font-medium text-ink">{a.name}</span>
                      <span className="text-right text-ink-muted">{a.reason}</span>
                    </li>
                  ))}
                </ul>
                {attention.length > 12 ? <p className="mt-2 text-xs text-ink-subtle">and {attention.length - 12} more</p> : null}
              </CardContent>
            </Card>
          ) : null}
          {awaitingReview.length ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <ClipboardCheck className="mr-1.5 inline size-4 text-brand" aria-hidden />
                  Projects waiting for you
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-ink-muted">
                  {awaitingReview.length} {awaitingReview.length === 1 ? 'submission needs' : 'submissions need'} a review before the
                  student can finish.
                </p>
                <Link href="/lms/reviews" className="font-medium text-brand underline-offset-2 hover:underline">
                  Open the review queue
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="No lessons yet" description="Lessons appear here once the course has content." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Lesson</TH>
                  <TH align="right">Started</TH>
                  <TH className="w-48">Finished</TH>
                  <TH align="right">Average score</TH>
                  <TH align="right">Tries per student</TH>
                  <TH align="right">Projects</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r, i) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/lms/courses/${courseId}/preview/${r.id}`} className="flex items-start gap-2 hover:underline">
                        <KindIcon kind={r.kind} className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
                        <span>
                          <span className="block font-medium text-ink">
                            {i + 1}. {r.title}
                          </span>
                          <span className="block text-xs text-ink-subtle">{r.moduleTitle}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD align="right" className="tnum">{r.started}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Progress value={r.started ? Math.round((r.completed / r.started) * 100) : 0} tone="success" />
                        <span className="w-8 text-right text-xs tnum">{r.completed}</span>
                      </div>
                    </TD>
                    <TD align="right" className="tnum">
                      {r.averageScore !== null ? (
                        <span className={r.averageScore < 80 ? 'text-warning' : undefined}>{r.averageScore}%</span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD align="right" className="tnum">{r.averageAttempts ?? '—'}</TD>
                    <TD align="right" className="tnum">
                      {r.submissions ? (
                        reviewFor.has(r.id) ? (
                          <Link href={`/lms/reviews/${reviewFor.get(r.id)}`} className="text-brand hover:underline">
                            {r.awaitingReview} to review
                          </Link>
                        ) : (
                          r.submissions
                        )
                      ) : (
                        '—'
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
      <p className="text-xs text-ink-subtle">
        Average score is each student&rsquo;s best knowledge-check result; the pass mark is 80%. Students with no activity for 7 days, or
        3 or more tries on a lesson without passing, are listed under &ldquo;Needs a nudge&rdquo;.
      </p>
    </div>
  )
}
