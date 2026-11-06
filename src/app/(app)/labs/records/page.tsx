import Link from 'next/link'
import { requireLabs } from '@/server/modules/labs/access'
import { labFormOptions } from '@/server/modules/labs/service'
import { sectionRecord } from '@/server/modules/labs/sessions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'

export const metadata = { title: 'Student practical records' }

export default async function LabRecordsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section: sectionId } = await searchParams
  const ctx = await requireLabs()
  const { sections } = await labFormOptions(ctx)
  const labSections = sections.filter((s) => s.classNumber >= 6)
  const record = sectionId ? await sectionRecord(ctx, sectionId).catch(() => null) : null

  return (
    <div className="space-y-4">
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Student practical records</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-center gap-2" action="/labs/records">
            <Select name="section" defaultValue={sectionId ?? ''} className="w-64" aria-label="Class">
              <option value="" disabled>
                Choose a class
              </option>
              {labSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm">
              Show
            </Button>
            {record ? (
              <Link href={`/labs/records/print/${record.section.id}`} className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} ml-auto`}>
                Print record
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {record ? (
        <Card variant="elevated" className="overflow-hidden">
          <CardHeader>
            <CardTitle>
              {record.section.label} · {record.sessions.length} practical{record.sessions.length === 1 ? '' : 's'} done
            </CardTitle>
          </CardHeader>
          {record.sessions.length === 0 ? (
            <CardContent>
              <EmptyState title="No practicals completed for this class yet" />
            </CardContent>
          ) : (
            <TableWrap sticky>
              <Table>
                <THead sticky>
                  <tr>
                    <TH>Student</TH>
                    <TH align="right">Attended</TH>
                    <TH align="right">Records checked</TH>
                    <TH align="right">Avg marks</TH>
                    {record.sessions.map((s, i) => (
                      <TH key={s.id} align="center" title={`${s.dateIso} · ${s.title}`}>
                        P{i + 1}
                      </TH>
                    ))}
                    <TH>Breakage</TH>
                  </tr>
                </THead>
                <TBody>
                  {record.students.map((st) => (
                    <TR key={st.studentId}>
                      <TD className="whitespace-nowrap text-ink">
                        {st.rollNumber ? `${st.rollNumber}. ` : ''}
                        {st.name}
                      </TD>
                      <TD align="right">
                        {st.attended}/{record.sessions.length}
                      </TD>
                      <TD align="right">{st.recorded}</TD>
                      <TD align="right">{st.averageMarks ?? '—'}</TD>
                      {st.entries.map((e, i) => (
                        <TD key={i} align="center" className={e?.present ? 'text-success' : 'text-ink-subtle'}>
                          {e ? (e.present ? (typeof e.marks === 'number' ? e.marks : '✓') : 'A') : '·'}
                        </TD>
                      ))}
                      <TD>
                        {st.breakages.join(', ') || '—'}
                        {st.chargesMinor ? ` (${formatMoney(st.chargesMinor)})` : ''}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
          {record.sessions.length ? (
            <CardContent className="pt-3">
              <ol className="grid gap-x-6 gap-y-0.5 text-xs text-ink-muted sm:grid-cols-2">
                {record.sessions.map((s, i) => (
                  <li key={s.id}>
                    P{i + 1}: {s.dateIso} · {s.title}
                  </li>
                ))}
              </ol>
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
