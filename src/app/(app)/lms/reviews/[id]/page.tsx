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
const PATHWAY = { PHYSICAL: 'Built the robot', TEACHER_VERIFIED: 'Teacher watched it run', VIRTUAL: 'Virtual (simulator)' } as const
const TRACK: Record<string, string> = { straight: 'Straight', curve: 'Gentle curve', 's-curve': 'S-curve', sharp: 'Sharp turns', oval: 'Oval', custom: 'Own track' }

type EvidenceShape = {
  simulator?: { track: string; seconds: number; baseSpeed?: number }[]
  checklist?: { done: number; total: number }
  models?: { title: string; labels: string[]; examples: number[]; tested: number; accuracy?: number; rounds: { examples: number; tested: number; accuracy: number }[] }[]
}

/** Recorded on the server from the student's saved simulator runs, models and checklist, not typed in by them. */
function Evidence({ evidence }: { evidence: unknown }) {
  const e = (evidence ?? {}) as EvidenceShape
  if (!e.simulator?.length && !e.checklist && !e.models?.length) return null
  return (
    <div className="rounded-[var(--radius)] bg-surface-2 p-3 text-sm">
      <p className="font-medium text-ink">Recorded in the course</p>
      {e.simulator?.length ? (
        <ul className="mt-1 space-y-0.5 text-ink-muted">
          {e.simulator.map((r) => (
            <li key={r.track}>
              Simulator: finished {TRACK[r.track] ?? r.track} in {r.seconds.toFixed(1)} s{r.baseSpeed ? ` at speed ${r.baseSpeed}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {e.models?.length ? (
        <ul className="mt-1 space-y-0.5 text-ink-muted">
          {e.models.map((m) => (
            <li key={m.title}>
              {m.title}: trained on {m.labels.map((l, i) => `${m.examples[i] ?? 0} ${l}`).join(', ')}
              {m.tested ? `; tested ${m.tested} times, ${m.accuracy ?? 0}% right` : '; not tested yet'}
              {m.rounds.length > 1 ? ` (test rounds: ${m.rounds.map((r) => `${r.accuracy}%`).join(' → ')})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {e.checklist ? (
        <p className="mt-1 text-ink-muted">
          Build checklist: {e.checklist.done} of {e.checklist.total} steps ticked
        </p>
      ) : null}
    </div>
  )
}

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
              {s.pathway ? (
                <p className="text-sm">
                  <span className="font-medium text-ink">Pathway: </span>
                  {PATHWAY[s.pathway as keyof typeof PATHWAY] ?? s.pathway}
                </p>
              ) : null}
              {s.pathway === 'TEACHER_VERIFIED' ? (
                <Notice tone="warning" title="Teacher-verified run">
                  Approve only after you (or a colleague) have watched this robot follow the track.
                </Notice>
              ) : null}
              {s.note ? <LessonText text={s.note} /> : <p className="text-sm text-ink-subtle">No note.</p>}
              {s.fileKeys.length ? (
                <div className="flex flex-wrap gap-2">
                  {s.fileKeys.map((k, i) =>
                    k.endsWith('.pdf') ? (
                      <a key={k} href={`/api/v1/files/${encodeURIComponent(k)}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                        Download PDF {i + 1}
                      </a>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={k} src={`/api/v1/files/${encodeURIComponent(k)}`} alt={`Project photo ${i + 1}`} className="max-h-64 rounded-[var(--radius)] border border-line object-contain" />
                    ),
                  )}
                </div>
              ) : null}
              {s.code ? (
                <details className="rounded-[var(--radius)] border border-line">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink">Their code ({s.code.split('\n').length} lines)</summary>
                  <pre className="max-h-96 overflow-auto border-t border-line bg-[#0b0b0d] p-3 text-xs text-white">
                    <code>{s.code}</code>
                  </pre>
                </details>
              ) : null}
              <Evidence evidence={s.evidence} />
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
