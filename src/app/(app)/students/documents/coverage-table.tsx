import Link from 'next/link'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { documentCategoryLabel, REQUIRED_DOCUMENT_KEYS } from '@/lib/student-documents'
import type { CoverageRow } from '@/server/modules/students/documents'

/**
 * The missing-document report.
 *
 * Lists only the students with a gap. A complete file is not news, and a
 * report where nine rows in ten say "nothing missing" is one nobody scans to
 * the bottom of — the count of complete files is stated once, above the table,
 * where it belongs.
 */
export function CoverageTable({ rows }: { rows: CoverageRow[] }) {
  const incomplete = rows.filter((r) => r.missing.length > 0 || r.expired.length > 0)
  const complete = rows.length - incomplete.length

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No students in this view"
        description="Choose a class to check, or add students to it first."
      />
    )
  }

  if (incomplete.length === 0) {
    return (
      <EmptyState
        title="Every file is complete"
        description={`All ${rows.length} student${rows.length === 1 ? '' : 's'} have ${REQUIRED_DOCUMENT_KEYS.map(documentCategoryLabel).join(', ')} on file, and nothing has expired.`}
      />
    )
  }

  return (
    <>
      <p className="px-3 py-2.5 text-xs text-ink-subtle border-b border-line">
        {incomplete.length} of {rows.length} student{rows.length === 1 ? '' : 's'} have something
        outstanding. {complete} {complete === 1 ? 'file is' : 'files are'} complete. Checked
        against: {REQUIRED_DOCUMENT_KEYS.map(documentCategoryLabel).join(', ')}.
      </p>

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Student</TH>
              <TH>Class</TH>
              <TH>Missing</TH>
              <TH>Expired</TH>
              <TH align="right">On file</TH>
            </tr>
          </THead>
          <TBody>
            {incomplete.map((row) => (
              <TR key={row.studentId}>
                <TD>
                  <Link
                    href={`/students/${row.studentId}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {row.firstName} {row.lastName}
                  </Link>
                  <span className="block text-xs text-ink-subtle">{row.admissionNo}</span>
                </TD>

                <TD>
                  {row.className ? `${row.className} ${row.sectionName ?? ''}`.trim() : '—'}
                </TD>

                <TD>
                  {row.missing.length === 0 ? (
                    <span className="text-ink-subtle">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {row.missing.map((key) => (
                        <Badge key={key} tone="danger">
                          {documentCategoryLabel(key)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TD>

                <TD>
                  {row.expired.length === 0 ? (
                    <span className="text-ink-subtle">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {row.expired.map((key) => (
                        <Badge key={key} tone="warning">
                          {documentCategoryLabel(key)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TD>

                <TD align="right" className="tnum">
                  {row.held}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </>
  )
}
