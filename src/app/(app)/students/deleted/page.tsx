import { requireContext } from '@/server/context'
import { listArchivedStudents } from '@/server/modules/students/service'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { PersonCell } from '@/components/ui/identity'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { RestoreRecordButton } from '@/components/record-actions'
import { restoreStudentAction } from '../actions'

export const metadata = { title: 'Deleted students' }

export default async function DeletedStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('students.delete')
  const params = await searchParams
  const rows = await listArchivedStudents(ctx, params.q?.trim() || undefined)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deleted students"
        description="Fees, attendance and results of deleted students are kept. Restoring puts the student back on this session's roll and switches their login back on."
        actions={<BackButton fallbackHref="/students" />}
      />
      <Card className="overflow-hidden">
        <SearchBar placeholder="Search name or admission number" />
        {rows.length === 0 ? (
          <EmptyState title="No deleted students" description="Students you delete appear here and can be restored." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Last class</TH>
                  <TH>Deleted on</TH>
                  <TH align="right"> </TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((s) => {
                  const last = s.enrollments[0]
                  return (
                    <TR key={s.id}>
                      <TD>
                        <PersonCell
                          firstName={s.firstName}
                          lastName={s.lastName}
                          avatarUrl={s.photoUrl}
                          secondary={s.admissionNo}
                        />
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {last ? `${last.classLevel.name} ${last.section.name} · ${last.session.name}` : '—'}
                      </TD>
                      <TD className="text-sm text-ink-muted">{s.deletedAt ? formatDay(s.deletedAt) : '—'}</TD>
                      <TD align="right">
                        <RestoreRecordButton
                          action={restoreStudentAction.bind(null, s.id)}
                          doneMessage="Student restored"
                        />
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
