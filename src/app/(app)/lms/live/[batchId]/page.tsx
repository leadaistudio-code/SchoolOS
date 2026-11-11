import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { requireLms } from '@/server/modules/lms/access'
import { getBatch } from '@/server/modules/lms/live'
import { classOptions, listCatalogue } from '@/server/modules/lms/school'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIst, istClock } from '@/lib/ist-clock'
import { meetingPlatform, type LiveState } from '@/lib/lms/live'
import { ArchiveBatchButton, BatchButton, ClassActions, ScheduleButton } from '../live-forms'

export const metadata = { title: 'Live batch · Robotics & AI' }

const STATE: Record<LiveState, { label: string; tone: 'neutral' | 'success' | 'info' }> = {
  upcoming: { label: 'Upcoming', tone: 'info' },
  open: { label: 'Live now', tone: 'success' },
  ended: { label: 'Done', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await requireLms('lms.view')
  const { batchId } = await params
  const data = await getBatch(ctx, batchId).catch(() => null)
  if (!data) notFound()
  const { batch, classes, audienceSize } = data
  const canTeach = ctx.can('lms.teach')
  const [classList, courses] = canTeach ? await Promise.all([classOptions(ctx), listCatalogue(ctx)]) : [[], []]
  const upcoming = classes.filter((c) => c.state === 'upcoming' || c.state === 'open')
  const past = classes.filter((c) => c.state === 'ended' || c.state === 'cancelled').reverse()
  const held = classes.filter((c) => c.state === 'ended')
  const avgJoined = held.length ? Math.round(held.reduce((s, c) => s + c._count.attendance, 0) / held.length) : null

  const table = (rows: typeof classes) => (
    <TableWrap>
      <Table>
        <THead>
          <tr>
            <TH>When (IST)</TH>
            <TH>Class</TH>
            <TH>Status</TH>
            <TH align="right">Joined</TH>
            <TH>Recording</TH>
            {canTeach ? <TH align="right"><span className="sr-only">Actions</span></TH> : null}
          </tr>
        </THead>
        <TBody>
          {rows.map((c) => (
            <TR key={c.id}>
              <TD className="whitespace-nowrap">
                <span className="font-medium text-ink">{formatIst(c.startsAt, 'EEE d MMM')}</span>
                <span className="block text-xs">{formatIst(c.startsAt, 'h:mm a')} · {c.durationMinutes} min</span>
              </TD>
              <TD>
                <Link href={`/lms/live/class/${c.id}`} className="font-medium text-ink hover:text-[var(--brand-600)]">
                  {c.title}
                </Link>
                {c.meetingUrl ? <span className="block text-xs text-ink-subtle">Own link · {meetingPlatform(c.meetingUrl)}</span> : null}
              </TD>
              <TD>
                <Badge tone={STATE[c.state].tone} dot={c.state === 'open'}>{STATE[c.state].label}</Badge>
              </TD>
              <TD align="right">{c.state === 'upcoming' || c.state === 'cancelled' ? '—' : `${c._count.attendance}/${audienceSize}`}</TD>
              <TD>
                {c.recordingUrl ? (
                  <a href={c.recordingUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--brand-600)] hover:underline">
                    Watch
                  </a>
                ) : (
                  <span className="text-xs text-ink-subtle">—</span>
                )}
              </TD>
              {canTeach ? (
                <TD align="right">
                  <div className="inline-flex items-center">
                    <ScheduleButton
                      batchId={batch.id}
                      trigger="icon"
                      liveClass={{
                        id: c.id,
                        title: c.title,
                        agenda: c.agenda ?? '',
                        date: formatIst(c.startsAt, 'yyyy-MM-dd'),
                        time: formatIst(c.startsAt, 'HH:mm'),
                        durationMinutes: String(c.durationMinutes),
                        meetingUrl: c.meetingUrl ?? '',
                      }}
                    />
                    <ClassActions id={c.id} cancelled={!!c.cancelledAt} recordingUrl={c.recordingUrl} />
                  </div>
                </TD>
              ) : null}
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title={batch.title}
        description={`${batch.audience} · ${audienceSize} students${batch.instructorName ? ` · ${batch.instructorName}` : ''}${avgJoined !== null ? ` · on average ${avgJoined} join` : ''}`}
        breadcrumbs={[{ label: 'Live classes', href: '/lms/live' }, { label: batch.title }]}
        actions={
          canTeach ? (
            <>
              <BatchButton
                classes={classList}
                courses={courses.filter((c) => c.status === 'PUBLISHED').map((c) => ({ id: c.id, title: c.title }))}
                batch={{
                  id: batch.id,
                  title: batch.title,
                  description: batch.description ?? '',
                  courseId: batch.courseId ?? '',
                  classLevelId: batch.classLevelId ?? '',
                  sectionId: batch.sectionId ?? '',
                  instructorName: batch.instructorName ?? '',
                  meetingUrl: batch.meetingUrl ?? '',
                }}
              />
              <ScheduleButton batchId={batch.id} defaults={{ date: istClock().iso }} />
            </>
          ) : null
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="text-ink-subtle">Meeting link: </span>
            {batch.meetingUrl ? (
              <a href={batch.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--brand-600)] hover:underline">
                {meetingPlatform(batch.meetingUrl)} <ExternalLink className="size-3.5" />
              </a>
            ) : (
              <span className="text-ink-muted">none, each class has its own</span>
            )}
          </span>
          {batch.course ? (
            <span>
              <span className="text-ink-subtle">Course: </span>
              <Link href={`/lms/courses/${batch.course.id}`} className="text-[var(--brand-600)] hover:underline">{batch.course.title}</Link>
            </span>
          ) : null}
          {batch.description ? <p className="w-full text-ink-muted">{batch.description}</p> : null}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Upcoming</h2>
        <Card className="overflow-hidden">
          {upcoming.length ? table(upcoming) : <EmptyState title="No classes scheduled" description={canTeach ? 'Schedule one, or a weekly series.' : undefined} />}
        </Card>
      </section>

      {past.length ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">Past classes</h2>
          <Card className="overflow-hidden">{table(past)}</Card>
        </section>
      ) : null}

      {canTeach ? (
        <div className="flex justify-end">
          <ArchiveBatchButton id={batch.id} />
        </div>
      ) : null}
      {canTeach && !batch.meetingUrl && classes.every((c) => !c.meetingUrl) ? (
        <p className="text-sm text-ink-muted">
          Tip: add a recurring meeting link to the batch so you do not have to paste it into every class.
        </p>
      ) : null}
    </div>
  )
}
