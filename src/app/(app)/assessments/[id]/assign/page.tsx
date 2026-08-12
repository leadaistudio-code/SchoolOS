import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getAssessment } from '@/server/modules/assessments/service'
import { listAssignmentsFor } from '@/server/modules/assessments/attempts'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState, Notice } from '@/components/ui/states'
import { formatDay } from '@/lib/dates'
import { AssignForm } from './assign-form'

export const metadata = { title: 'Assign' }

export default async function AssignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('assessments.view')
  const [assessment, assignments] = await Promise.all([
    getAssessment(ctx, id),
    listAssignmentsFor(ctx, id),
  ])

  const sections = await ctx.db.section.findMany({
    where: { classLevelId: assessment.classSubject.classLevel.id, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, _count: { select: { enrollments: true } } },
  })

  const approved = assessment.status === 'APPROVED' || assessment.status === 'ASSIGNED'
  const canAssign = ctx.can('assessments.assign')

  return (
    <div>
      <PageHeader
        title={`Assign ${assessment.title}`}
        description={`${assessment.classSubject.classLevel.name} · ${assessment.classSubject.subject.name} · ${assessment.totalMarks} marks`}
        breadcrumbs={[
          { label: 'Question papers', href: '/assessments' },
          { label: assessment.title, href: `/assessments/${assessment.id}` },
          { label: 'Assign' },
        ]}
      />

      <div className="flex flex-col gap-4">
        {!approved && (
          <Notice tone="warning" title="This paper is not approved yet">
            A paper is checked for whether its questions add up at approval. Assigning one that has
            not been checked puts an arithmetic error in front of a class.{' '}
            <Link href={`/assessments/${assessment.id}`} className="underline">
              Go back and approve it
            </Link>
            .
          </Notice>
        )}

        {assignments.length > 0 && (
          <Card className="overflow-hidden">
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Given to</TH>
                    <TH>Mode</TH>
                    <TH>Opens</TH>
                    <TH>Closes</TH>
                    <TH align="right">Attempts</TH>
                    <TH align="right">&nbsp;</TH>
                  </tr>
                </THead>
                <TBody>
                  {assignments.map((assignment) => (
                    <TR key={assignment.id}>
                      <TD className="text-sm text-ink">
                        {assignment.section?.name
                          ? `${assignment.classLevel?.name ?? ''}-${assignment.section.name}`
                          : (assignment.classLevel?.name ?? 'Whole class')}
                      </TD>
                      <TD>
                        <Badge tone={assignment.mode === 'ONLINE' ? 'info' : 'neutral'}>
                          {assignment.mode.toLowerCase()}
                        </Badge>
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {formatDay(assignment.opensAt, 'd MMM, h:mm a')}
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {formatDay(assignment.dueAt, 'd MMM, h:mm a')}
                      </TD>
                      <TD align="right" className="text-sm tnum">
                        {assignment._count.attempts}
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/assessments/${assessment.id}/evaluate/${assignment.id}`}
                          className="text-sm font-medium text-brand-600 hover:underline"
                        >
                          Open
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </Card>
        )}

        {canAssign && approved ? (
          <AssignForm
            assessmentId={assessment.id}
            defaultMinutes={assessment.durationMinutes}
            sections={sections.map((section) => ({
              id: section.id,
              name: section.name,
              students: section._count.enrollments,
            }))}
          />
        ) : assignments.length === 0 ? (
          <Card>
            <EmptyState
              title="Not assigned yet"
              description={
                canAssign
                  ? 'Approve the paper first, then set who sits it and when.'
                  : 'You do not have permission to assign papers.'
              }
            />
          </Card>
        ) : null}
      </div>
    </div>
  )
}
