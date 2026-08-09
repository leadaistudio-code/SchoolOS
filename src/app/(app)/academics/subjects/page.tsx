import { requireContext } from '@/server/context'
import { listSubjects } from '@/server/modules/academics/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'

export const metadata = { title: 'Subjects' }

export default async function SubjectsPage() {
  const ctx = await requireContext('academics.view')
  const subjects = await listSubjects(ctx)

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Subjects offered across the school and how many classes teach each one."
      />

      <Card className="overflow-hidden">
        {subjects.length === 0 ? (
          <EmptyState title="No subjects" description="Add subjects to build timetables and exams." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Subject</TH>
                  <TH>Type</TH>
                  <TH align="right">Classes</TH>
                </tr>
              </THead>
              <TBody>
                {subjects.map((s) => (
                  <TR key={s.id}>
                    <TD className="text-[13px] text-ink-muted tnum">{s.code}</TD>
                    <TD className="text-[13.5px] text-ink">{s.name}</TD>
                    <TD>
                      <Badge tone={s.isElective ? 'info' : 'neutral'}>
                        {s.isElective ? 'elective' : 'core'}
                      </Badge>
                    </TD>
                    <TD align="right" className="text-[13px]">
                      {s._count.classes}
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
