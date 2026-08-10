import Link from 'next/link'
import { requireContext } from '@/server/context'
import {
  listAssignments,
  routeOptions,
  unassignedStudents,
} from '@/server/modules/transport/service'
import { parseListQuery } from '@/lib/query'
import { formatMoney } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { PersonCell } from '@/components/ui/identity'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { AssignPanel, EndAssignmentButton } from './assign-panel'

export const metadata = { title: 'Transport Assignments' }

const DIRECTION_LABEL: Record<string, string> = {
  BOTH: 'Both ways',
  PICKUP: 'Pickup only',
  DROP: 'Drop only',
}

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('transport.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const canManage = ctx.can('transport.manage')

  const [{ rows, total }, routes, students] = await Promise.all([
    listAssignments(ctx, { ...query, routeId: params.routeId }),
    canManage ? routeOptions(ctx) : Promise.resolve([]),
    canManage ? unassignedStudents(ctx) : Promise.resolve([]),
  ])

  const currency = ctx.tenant.currency

  return (
    <div>
      <PageHeader
        title="Transport Assignments"
        description={`${total} student${total === 1 ? '' : 's'} travelling by school bus`}
        breadcrumbs={[{ label: 'Transport', href: '/transport' }, { label: 'Assignments' }]}
        actions={
          canManage ? (
            <AssignPanel
              routes={routes.map((route) => ({
                id: route.id,
                name: route.name,
                code: route.code,
                stops: route.stops,
              }))}
              students={students.map((student) => ({
                id: student.id,
                firstName: student.firstName,
                lastName: student.lastName,
                admissionNo: student.admissionNo,
                className: student.enrollments[0]?.classLevel.name ?? null,
              }))}
            />
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search by name or admission number" />

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'No riders match that search' : 'Nobody is on a route yet'}
            description={
              canManage
                ? 'Assign a student to a stop and their guardians can follow the bus from the tracking screen.'
                : 'The school office assigns students to bus routes.'
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Student</TH>
                    <TH>Class</TH>
                    <TH>Route</TH>
                    <TH>Stop</TH>
                    <TH>Times</TH>
                    <TH>Travels</TH>
                    <TH align="right">Fare</TH>
                    {canManage ? (
                      <TH align="right">
                        <span className="sr-only">Actions</span>
                      </TH>
                    ) : null}
                  </tr>
                </THead>
                <TBody>
                  {rows.map((assignment) => {
                    const enrollment = assignment.student.enrollments[0]
                    return (
                      <TR key={assignment.id}>
                        <TD>
                          <PersonCell
                            firstName={assignment.student.firstName}
                            lastName={assignment.student.lastName}
                            secondary={assignment.student.admissionNo}
                            avatarUrl={assignment.student.photoUrl}
                            href={`/students/${assignment.student.id}`}
                          />
                        </TD>
                        <TD>
                          {enrollment
                            ? `${enrollment.classLevel.name} · ${enrollment.section.name}`
                            : '—'}
                        </TD>
                        <TD>
                          <Link
                            href={`/transport/routes/${assignment.route.id}`}
                            className="text-sm text-ink hover:text-[var(--brand-600)]"
                          >
                            {assignment.route.name}
                          </Link>
                          {assignment.bus ? (
                            <span className="block text-xs text-ink-subtle">
                              {assignment.bus.code} · {assignment.bus.registrationNo}
                            </span>
                          ) : (
                            <span className="block text-xs text-warning">No bus allocated</span>
                          )}
                        </TD>
                        <TD className="font-medium text-ink">{assignment.stop.name}</TD>
                        <TD className="tnum text-ink-muted">
                          {assignment.stop.pickupTime ?? '—'} / {assignment.stop.dropTime ?? '—'}
                        </TD>
                        <TD>
                          <Badge tone={assignment.direction === 'BOTH' ? 'neutral' : 'info'}>
                            {DIRECTION_LABEL[assignment.direction] ?? assignment.direction}
                          </Badge>
                        </TD>
                        <TD align="right" className="tnum">
                          {assignment.stop.fareMinor === null
                            ? '—'
                            : formatMoney(assignment.stop.fareMinor, currency)}
                        </TD>
                        {canManage ? (
                          <TD align="right">
                            <EndAssignmentButton
                              assignmentId={assignment.id}
                              name={assignment.student.firstName}
                            />
                          </TD>
                        ) : null}
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="riders" />
          </>
        )}
      </Card>
    </div>
  )
}
