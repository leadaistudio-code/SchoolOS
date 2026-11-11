import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Video } from 'lucide-react'
import { requireLms } from '@/server/modules/lms/access'
import { liveClassForLearner } from '@/server/modules/lms/live'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { Notice } from '@/components/ui/states'
import { LessonText } from '@/components/lms/lesson-text'
import { RecordingView } from '@/components/lms/recording-view'
import { formatIst } from '@/lib/ist-clock'
import { meetingPlatform } from '@/lib/lms/live'

export const metadata = { title: 'Live class' }

export default async function MyLiveClassPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLms('lms.learn')
  const { id } = await params
  const c = await liveClassForLearner(ctx, id).catch(() => null)
  if (!c) notFound()

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.title}
        description={`${formatIst(c.startsAt, 'EEEE d MMMM, h:mm a')} · ${c.durationMinutes} min · ${c.batch.title}${c.batch.instructorName ? ` · ${c.batch.instructorName}` : ''}`}
        breadcrumbs={[{ label: 'Live classes', href: '/my/learning/live' }, { label: c.title }]}
        actions={
          c.state === 'open' ? (
            <a href={`/my/learning/live/${c.id}/join`} target="_blank" rel="noopener" className={buttonVariants({})}>
              <Video /> Join {meetingPlatform(c.meetingUrl)}
            </a>
          ) : null
        }
      />
      {c.state === 'cancelled' ? <Notice tone="warning">This class was cancelled.</Notice> : null}
      {c.recordingUrl ? (
        <RecordingView url={c.recordingUrl} title={c.title} />
      ) : c.state === 'ended' ? (
        <Notice tone="info">No recording has been added for this class yet.</Notice>
      ) : null}
      {c.agenda ? (
        <Card>
          <CardContent>
            <LessonText text={c.agenda} />
          </CardContent>
        </Card>
      ) : null}
      {c.batch.course ? (
        <p className="text-sm text-ink-muted">
          Part of{' '}
          <Link href={`/my/learning/${c.batch.course.id}`} className="text-[var(--brand-600)] hover:underline">
            {c.batch.course.title}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
