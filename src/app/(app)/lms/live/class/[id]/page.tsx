import { notFound } from 'next/navigation'
import { Video } from 'lucide-react'
import { requireLms } from '@/server/modules/lms/access'
import { liveClassAttendance } from '@/server/modules/lms/live'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { LessonText } from '@/components/lms/lesson-text'
import { RecordingView } from '@/components/lms/recording-view'
import { formatIst } from '@/lib/ist-clock'
import { meetingPlatform } from '@/lib/lms/live'
import { ClassActions } from '../../live-forms'

export const metadata = { title: 'Live class · Robotics & AI' }

export default async function LiveClassPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLms('lms.view')
  const { id } = await params
  const data = await liveClassAttendance(ctx, id).catch(() => null)
  if (!data) notFound()
  const { liveClass: c, rows, joinedCount } = data
  const canTeach = ctx.can('lms.teach')

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.title}
        description={`${formatIst(c.startsAt, 'EEEE d MMMM, h:mm a')} IST · ${c.durationMinutes} min · ${joinedCount} of ${rows.length} joined`}
        breadcrumbs={[
          { label: 'Live classes', href: '/lms/live' },
          { label: c.batch.title, href: `/lms/live/${c.batch.id}` },
          { label: c.title },
        ]}
        actions={
          <>
            {c.state === 'cancelled' ? <Badge>Cancelled</Badge> : null}
            {c.effectiveUrl && (c.state === 'open' || c.state === 'upcoming') ? (
              <a href={c.effectiveUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: c.state === 'open' ? 'primary' : 'secondary' })}>
                <Video /> {c.state === 'open' ? 'Start' : 'Open'} {meetingPlatform(c.effectiveUrl)}
              </a>
            ) : null}
            {canTeach ? <ClassActions id={c.id} cancelled={!!c.cancelledAt} recordingUrl={c.recordingUrl} /> : null}
          </>
        }
      />

      {c.agenda ? (
        <Card>
          <CardContent>
            <LessonText text={c.agenda} />
          </CardContent>
        </Card>
      ) : null}

      {c.recordingUrl ? <RecordingView url={c.recordingUrl} title={c.title} /> : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Who joined</CardTitle>
        </CardHeader>
        {rows.length === 0 ? (
          <EmptyState title="No students in this batch" description="Check the batch's class and section." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student</TH>
                  <TH>Class</TH>
                  <TH>Joined</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.studentId}>
                    <TD>
                      <span className="font-medium text-ink">{r.name}</span>
                      <span className="block text-xs text-ink-subtle">{r.admissionNo}</span>
                    </TD>
                    <TD>
                      {r.className}
                      {r.sectionName ? ` – ${r.sectionName}` : ''}
                    </TD>
                    <TD>
                      {r.joinedAt ? (
                        <span className="text-success">
                          {formatIst(r.joinedAt, 'h:mm a')}
                          {r.joins > 1 ? ` · ${r.joins} times` : ''}
                        </span>
                      ) : (
                        <span className="text-ink-subtle">Did not join</span>
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
        “Joined” means the student pressed Join in their portal. Zoom or Meet’s own report shows how long they stayed.
      </p>
    </div>
  )
}
