import Link from 'next/link'
import { requireContext } from '@/server/context'
import { assignmentProgress } from '@/server/modules/assessments/attempts'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { formatDay } from '@/lib/dates'
import { buttonVariants } from '@/components/ui/button-variants'
import { PublishResults } from './publish'

export const metadata = { title: 'Attempts' }

const STATUS_TONE = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'warning',
  SUBMITTED: 'info',
  EVALUATED: 'success',
} as const

const STATUS_LABEL = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  EVALUATED: 'Marked',
} as const

/**
 * Who has sat it.
 *
 * The column that matters is the one for students with no row at all: a list of
 * submissions answers "who did it", and the useful question the morning after a
 * test is who did not.
 */
export default async function AttemptsPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>
}) {
  const { id, assignmentId } = await params
  const ctx = await requireContext('assessments.view')
  const { assignment, rows } = await assignmentProgress(ctx, assignmentId)

  const submitted = rows.filter(
    (row) => row.status === 'SUBMITTED' || row.status === 'EVALUATED',
  ).length
  const notStarted = rows.filter((row) => row.status === 'NOT_STARTED').length
  const marked = rows.filter((row) => row.status === 'EVALUATED').length
  const released = rows.filter((row) => row.published).length

  return (
    <div>
      <PageHeader
        title={assignment.title}
        description={`${assignment.mode.toLowerCase()} · closes ${formatDay(assignment.dueAt, 'd MMM, h:mm a')} · ${assignment.totalMarks} marks`}
        breadcrumbs={[
          { label: 'Question papers', href: '/assessments' },
          { label: assignment.title, href: `/assessments/${id}` },
          { label: 'Attempts' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/assessments/${id}/evaluate/${assignmentId}/analytics`}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Analytics
            </Link>
            {ctx.can('assessments.publish') && (
              <PublishResults assignmentId={assignmentId} pending={marked - released} />
            )}
          </div>
        }
      />

      <MetricRow columns={4}>
        <Metric label="Students" value={String(rows.length)} />
        <Metric label="Submitted" value={String(submitted)} />
        <Metric label="Not started" value={String(notStarted)} />
        <Metric label="Marked" value={String(marked)} />
      </MetricRow>

      <Card className="mt-4 overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No students in this section"
            description="Enrol students in the section before assigning a paper to it."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Status</TH>
                  <TH>Submitted</TH>
                  <TH align="right">Objective</TH>
                  <TH align="right">Total</TH>
                  <TH>Released</TH>
                  <TH align="right">&nbsp;</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.studentId}>
                    <TD className="text-sm text-ink">{row.name}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[row.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
                        {STATUS_LABEL[row.status as keyof typeof STATUS_LABEL] ?? row.status}
                      </Badge>
                      {row.autoSubmitted && (
                        <span className="ml-2 text-xs text-ink-subtle">time up</span>
                      )}
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {row.submittedAt ? formatDay(row.submittedAt, 'd MMM, h:mm a') : '—'}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {row.objectiveScore ?? '—'}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {row.totalScore ?? '—'}
                    </TD>
                    <TD className="text-sm text-ink-muted">{row.published ? 'Yes' : 'No'}</TD>
                    <TD align="right">
                      {row.attemptId && row.status !== 'IN_PROGRESS' ? (
                        <Link
                          href={`/assessments/${id}/evaluate/${assignmentId}/${row.attemptId}`}
                          className="text-sm font-medium text-brand-600 hover:underline"
                        >
                          {row.status === 'EVALUATED' ? 'Review' : 'Mark'}
                        </Link>
                      ) : (
                        <span className="text-sm text-ink-subtle">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
