import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listCoverage } from '@/server/modules/curriculum/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { StartSyllabus } from './start-syllabus'

export const metadata = { title: 'Syllabus' }

/**
 * Syllabus coverage.
 *
 * Listed by class-subject rather than by syllabus, because the question worth
 * answering on arrival is which subjects still have none — a list of the ones
 * already entered cannot show a gap.
 */
export default async function CurriculumPage() {
  const ctx = await requireContext('curriculum.view')
  const rows = await listCoverage(ctx)
  const canManage = ctx.can('curriculum.manage')

  const withSyllabus = rows.filter((r) => r.curriculum).length
  const published = rows.filter((r) => r.curriculum?.isPublished).length

  return (
    <div>
      <PageHeader
        title="Syllabus"
        description={`${withSyllabus} of ${rows.length} subjects mapped · ${published} published`}
      />

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No subjects assigned"
            description="Subjects appear here once they are attached to a class in Academics."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Class</TH>
                  <TH>Subject</TH>
                  <TH>Teacher</TH>
                  <TH align="right">Chapters</TH>
                  <TH align="right">Topics</TH>
                  <TH>Status</TH>
                  <TH align="right">&nbsp;</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.classSubjectId}>
                    <TD className="text-sm text-ink">{row.classLevel.name}</TD>
                    <TD className="text-sm text-ink">{row.subject.name}</TD>
                    <TD className="text-sm text-ink-muted">{row.teacher?.name ?? '—'}</TD>
                    <TD align="right" className="text-sm tnum">
                      {row.curriculum?.chapterCount ?? '—'}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {row.curriculum?.topicCount ?? '—'}
                    </TD>
                    <TD>
                      {!row.curriculum ? (
                        <Badge tone="neutral">not started</Badge>
                      ) : row.curriculum.isPublished ? (
                        <Badge tone="success">published</Badge>
                      ) : (
                        <Badge tone="warning">draft</Badge>
                      )}
                    </TD>
                    <TD align="right">
                      {row.curriculum ? (
                        <Link
                          href={`/academics/curriculum/${row.curriculum.id}`}
                          className="text-sm font-medium text-brand-600 hover:underline"
                        >
                          Open
                        </Link>
                      ) : canManage ? (
                        <StartSyllabus
                          classSubjectId={row.classSubjectId}
                          label={`${row.subject.name} for ${row.classLevel.name}`}
                        />
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
