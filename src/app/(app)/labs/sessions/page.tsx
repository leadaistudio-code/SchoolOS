import Link from 'next/link'
import { requireLabs } from '@/server/modules/labs/access'
import { labFormOptions, listLabs } from '@/server/modules/labs/service'
import { bookingOptions, listExperiments, listSessions } from '@/server/modules/labs/sessions'
import { schoolToday } from '@/lib/periods'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { BookSessionForm } from '../forms'
import { cancelSessionAction } from '../actions'

export const metadata = { title: 'Practical sessions' }

export default async function LabSessionsPage() {
  const ctx = await requireLabs()
  const today = schoolToday()
  const canBook = ctx.can('labs.sessions')
  const [labs, upcoming, recent] = await Promise.all([
    listLabs(ctx),
    listSessions(ctx, { status: 'SCHEDULED', take: 100 }),
    listSessions(ctx, { status: 'COMPLETED', take: 30 }),
  ])
  const [options, experiments, booking] = canBook
    ? await Promise.all([labFormOptions(ctx), listExperiments(ctx), bookingOptions(ctx)])
    : [null, [], null]
  const overdue = upcoming.filter((s) => s.dateIso < today)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        {overdue.length ? (
          <Notice tone="warning">
            {overdue.length} past session{overdue.length > 1 ? 's are' : ' is'} still open. Mark attendance and complete them so the
            register and student records stay right.
          </Notice>
        ) : null}
        <Card variant="elevated" className="overflow-hidden">
          <CardHeader>
            <CardTitle>Scheduled · {upcoming.length}</CardTitle>
          </CardHeader>
          {upcoming.length === 0 ? (
            <CardContent>
              <EmptyState title="No practicals booked" description="Book the lab for a class from the form." />
            </CardContent>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Time</TH>
                    <TH>Class</TH>
                    <TH>Practical</TH>
                    <TH>Lab</TH>
                    <TH />
                  </tr>
                </THead>
                <TBody>
                  {upcoming.map((s) => (
                    <TR key={s.id}>
                      <TD className="whitespace-nowrap text-ink">
                        {s.dateIso}
                        {s.dateIso < today ? <Badge tone="warning" className="ml-1">Open</Badge> : null}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {s.startTime}–{s.endTime}
                      </TD>
                      <TD>
                        {s.sectionLabel}
                        {s.batch ? ` · ${s.batch}` : ''}
                      </TD>
                      <TD className="text-ink">
                        <Link href={`/labs/sessions/${s.id}`} className="hover:underline">
                          {s.experiment?.title ?? 'Practical'}
                        </Link>
                        {s.teacherLabel ? <span className="block text-xs text-ink-subtle">{s.teacherLabel}</span> : null}
                      </TD>
                      <TD>{s.lab.name}</TD>
                      <TD align="right" className="whitespace-nowrap">
                        <Link href={`/labs/sessions/${s.id}`} className="mr-2 text-sm font-medium text-[var(--brand-600)] hover:underline">
                          Conduct
                        </Link>
                        {canBook ? (
                          <form action={cancelSessionAction.bind(null, s.id)} className="inline">
                            <Button type="submit" variant="ghost" size="sm">
                              Cancel
                            </Button>
                          </form>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>

        <Card variant="elevated" className="overflow-hidden">
          <CardHeader>
            <CardTitle>Recently completed</CardTitle>
          </CardHeader>
          {recent.length === 0 ? (
            <CardContent>
              <p className="text-sm text-ink-muted">No completed practicals yet.</p>
            </CardContent>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Class</TH>
                    <TH>Practical</TH>
                    <TH align="right">Students</TH>
                  </tr>
                </THead>
                <TBody>
                  {recent.map((s) => (
                    <TR key={s.id}>
                      <TD className="whitespace-nowrap">{s.dateIso}</TD>
                      <TD>{s.sectionLabel}</TD>
                      <TD className="text-ink">
                        <Link href={`/labs/sessions/${s.id}`} className="hover:underline">
                          {s.experiment?.title ?? 'Practical'}
                        </Link>
                      </TD>
                      <TD align="right">{s._count.students}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>

      {canBook && options && booking ? (
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Book the lab</CardTitle>
          </CardHeader>
          <CardContent>
            {labs.length === 0 ? (
              <p className="text-sm text-ink-muted">Set up a lab first.</p>
            ) : (
              <BookSessionForm
                today={today}
                labs={labs.map((l) => ({ id: l.id, label: l.name }))}
                sections={options.sections}
                staff={options.staff}
                periods={booking.periods}
                experiments={experiments.map((e) => ({
                  id: e.id,
                  classNumber: e.classNumber,
                  label: `${e.classNumber ? `Class ${e.classNumber} · ` : ''}${e.title}`,
                }))}
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
