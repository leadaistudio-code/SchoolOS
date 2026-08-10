import { Paperclip } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getHomework } from '@/server/modules/homework/service'
import { scopedStudents } from '@/server/scope'
import { isSelfScoped } from '@/lib/rbac/roles'
import { formatDay } from '@/lib/dates'
import { formatBytes } from '@/lib/format'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SubmissionPanel } from './submission-panel'
import { ReviewList } from './review-list'
import { PublishToggle } from './publish-toggle'

export const metadata = { title: 'Homework' }

export default async function HomeworkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireContext('homework.view')
  const { homework, submissions, pending } = await getHomework(ctx, id)

  const portalView = isSelfScoped(ctx.user.roleKeys)
  const children = portalView ? await scopedStudents(ctx) : []
  const canReview = ctx.can('homework.review')

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        title={homework.title}
        description={`${homework.classSubject.subject.name} · ${homework.classLevel.name}${
          homework.section ? ` ${homework.section.name}` : ''
        } · due ${formatDay(homework.dueOn, 'd MMMM yyyy')}`}
        actions={
          ctx.can('homework.edit') ? (
            <PublishToggle id={homework.id} isPublished={homework.isPublished} />
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Instructions</CardTitle>
            <p className="text-sm text-ink-muted mt-0.5">
              Set by {homework.teacher.firstName} {homework.teacher.lastName} on{' '}
              {formatDay(homework.assignedOn, 'd MMM yyyy')}
              {homework.maxScore ? ` · out of ${homework.maxScore}` : ''}
            </p>
          </div>
          {!homework.isPublished ? <Badge tone="neutral">draft</Badge> : null}
        </CardHeader>
        <CardContent className="py-1">
          {homework.instructions ? (
            <p className="text-base text-ink whitespace-pre-wrap">{homework.instructions}</p>
          ) : (
            <p className="text-base text-ink-subtle">No further instructions given.</p>
          )}

          {homework.attachments.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {homework.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/v1/files/${encodeURIComponent(a.storageKey)}`}
                    className="inline-flex items-center gap-2 text-sm text-[var(--brand-600)] hover:underline"
                  >
                    <Paperclip className="size-3.5" aria-hidden />
                    {a.fileName}
                    <span className="text-ink-subtle">{formatBytes(a.sizeBytes)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {portalView ? (
        <SubmissionPanel
          homeworkId={homework.id}
          maxScore={homework.maxScore}
          students={children}
          submissions={submissions.map((s) => ({
            id: s.id,
            studentId: s.studentId,
            status: s.status,
            score: s.score,
            submittedAt: s.submittedAt,
            note: s.note,
            teacherComment: s.teacherComment,
          }))}
        />
      ) : null}

      {canReview ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Submissions</CardTitle>
              <p className="text-sm text-ink-muted mt-0.5">
                {submissions.length} handed in · {pending.length} outstanding
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-0">
            {submissions.length === 0 ? (
              <EmptyState
                title="Nothing handed in yet"
                description="Submissions will appear here as students hand their work in."
              />
            ) : (
              <ReviewList
                maxScore={homework.maxScore}
                submissions={submissions.map((s) => ({
                  id: s.id,
                  studentName: `${s.student.firstName} ${s.student.lastName}`,
                  admissionNo: s.student.admissionNo,
                  status: s.status,
                  score: s.score,
                  note: s.note,
                  teacherComment: s.teacherComment,
                  submittedAt: s.submittedAt,
                  attachments: s.attachments.map((a) => ({
                    id: a.id,
                    fileName: a.fileName,
                    storageKey: a.storageKey,
                    sizeBytes: a.sizeBytes,
                  })),
                }))}
              />
            )}

            {pending.length > 0 ? (
              <div className="px-4 py-3 border-t border-line">
                <p className="text-xs font-medium text-ink mb-1.5">
                  Not handed in ({pending.length})
                </p>
                <p className="text-xs text-ink-muted">
                  {pending
                    .slice(0, 12)
                    .map((p) => `${p.student.firstName} ${p.student.lastName}`)
                    .join(', ')}
                  {pending.length > 12 ? ` and ${pending.length - 12} more` : ''}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
