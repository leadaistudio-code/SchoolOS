import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { requireLms } from '@/server/modules/lms/access'
import { getSubmission } from '@/server/modules/lms/projects'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { Notice } from '@/components/ui/states'
import { LessonText } from '@/components/lms/lesson-text'
import { RecordingView } from '@/components/lms/recording-view'
import { formatIst } from '@/lib/ist-clock'
import { documentEmbedUrl, videoEmbedUrl } from '@/lib/lms/media'
import { ReviewForm } from './review-form'

export const metadata = { title: 'Review project · Robotics & AI' }

const LABEL = { SUBMITTED: 'Waiting for review', CHANGES_REQUESTED: 'Sent back', APPROVED: 'Approved' } as const

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLms('lms.teach')
  const { id } = await params
  const data = await getSubmission(ctx, id).catch(() => null)
  if (!data) notFound()
  const { submission: s, lesson } = data
  const embeddable = s.linkUrl && (videoEmbedUrl(s.linkUrl) || documentEmbedUrl(s.linkUrl))

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${data.studentName} · ${lesson?.title ?? 'Project'}`}
        description={`${data.className || data.admissionNo} · ${lesson?.course.title ?? ''} · handed in ${formatIst(s.submittedAt, 'd MMM, h:mm a')}${s.version > 1 ? ` (attempt ${s.version})` : ''}`}
        breadcrumbs={[{ label: 'Project reviews', href: '/lms/reviews' }, { label: data.studentName }]}
        actions={<StatusBadge status={s.status} label={LABEL[s.status]} tone={s.status === 'CHANGES_REQUESTED' ? 'warning' : undefined} />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>The student&apos;s work</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {s.note ? <LessonText text={s.note} /> : <p className="text-sm text-ink-subtle">No note.</p>}
              {s.linkUrl ? (
                embeddable ? (
                  <RecordingView url={s.linkUrl} title="Project" />
                ) : (
                  <a href={s.linkUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    <ExternalLink /> Open their link
                  </a>
                )
              ) : null}
            </CardContent>
          </Card>
          {lesson?.body ? (
            <Card>
              <CardHeader>
                <CardTitle>Project brief</CardTitle>
              </CardHeader>
              <CardContent>
                <LessonText text={lesson.body} />
              </CardContent>
            </Card>
          ) : null}
        </div>
        <aside className="space-y-3 lg:sticky lg:top-4 self-start">
          <Card>
            <CardHeader>
              <CardTitle>Your review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {s.reviewedAt ? (
                <Notice tone="info">
                  Last reviewed by {s.reviewedByLabel ?? 'a teacher'} on {formatIst(s.reviewedAt, 'd MMM')}.
                </Notice>
              ) : null}
              <ReviewForm id={s.id} feedback={s.feedback ?? ''} score={s.score !== null ? String(s.score) : ''} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
