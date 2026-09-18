import Link from 'next/link'
import { ChevronLeft, Download, IdCard } from 'lucide-react'
import { requireContext } from '@/server/context'
import { isPortalOnlyRole } from '@/server/scope'
import { getExamDetail, listAvailableExamPapers } from '@/server/modules/exams/service'
import { listAdmitCards } from '@/server/modules/exams/admit-cards'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { AddExamPaperForm, ExamMetaForm, ExamPapersForm, DeleteExamButton } from './exam-detail-forms'
import { ExamPapersBulkUpload } from './papers-bulk-upload'

export const metadata = { title: 'Exam detail' }

export default async function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('exams.view')
  const { id } = await params
  const canManage = ctx.can('exams.manage')
  const portal = isPortalOnlyRole(ctx.user.roleKeys)
  const exam = await getExamDetail(ctx, id)
  const availablePapers = canManage && exam.status !== 'PUBLISHED'
    ? await listAvailableExamPapers(ctx, id)
    : []
  const admitCards = portal ? (await listAdmitCards(ctx, id)).rows : []
  const isParent = ctx.user.roleKeys.includes('PARENT')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/exams" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden />
          All exams
        </Link>
        <div className="flex flex-wrap gap-2">
          {ctx.can('exams.admit_cards') ? (
            <Link href={`/exams/${exam.id}/admit-cards`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              Admit cards
            </Link>
          ) : portal ? (
            <Link href="/exams/my-admit-cards" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              My admit cards
            </Link>
          ) : null}
          {ctx.can('exams.attendance') ? (
            <Link href={`/exams/${exam.id}/attendance`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              Exam attendance
            </Link>
          ) : null}
          {ctx.can('exams.marks') ? (
            <Link href={`/exams/${exam.id}/marks`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              Enter marks
            </Link>
          ) : null}
          {ctx.can('results.view') && exam.status === 'PUBLISHED' ? (
            <Link href={`/exams/results?exam=${exam.id}`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              Results
            </Link>
          ) : null}
          {ctx.can('exams.delete') ? (
            <DeleteExamButton examId={exam.id} examName={exam.name} status={exam.status} />
          ) : null}
        </div>
      </div>

      <PageHeader
        title={exam.name}
        description={
          portal
            ? `${exam.kind.replaceAll('_', ' ')} · timetable and admit card`
            : `${exam.kind.replaceAll('_', ' ')} · ${exam._count.results} results · ${
                exam.gradingScale?.name ?? 'No grading scale'
              }`
        }
        actions={<StatusBadge status={exam.status} />}
      />

      {portal ? (
        <Card>
          <CardHeader>
            <CardTitle>Admit card</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {admitCards.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No admit card has been issued for this exam yet. Check again after the school generates
                and approves cards.
              </p>
            ) : (
              admitCards.map((card) => {
                const canDownload = card.status === 'APPROVED'
                return (
                  <div
                    key={card.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-line px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {isParent
                          ? `${card.student.firstName} ${card.student.lastName}`
                          : 'Your admit card'}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {card.student.admissionNo} · <StatusBadge status={card.status} />
                      </p>
                    </div>
                    {canDownload ? (
                      <Link href={`/exams/admit-cards/${card.id}`} className={buttonVariants({ size: 'sm' })}>
                        <Download className="size-4" aria-hidden />
                        Download / print
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                        <IdCard className="size-3.5" aria-hidden />
                        Awaiting school approval
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <ExamMetaForm exam={exam} />
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="caption">Starts</dt>
                  <dd>{exam.startsOn ? formatDay(exam.startsOn, 'd MMM yyyy') : '—'}</dd>
                </div>
                <div>
                  <dt className="caption">Ends</dt>
                  <dd>{exam.endsOn ? formatDay(exam.endsOn, 'd MMM yyyy') : '—'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="caption">Classes</dt>
                  <dd>{exam.classes.map((c) => c.classLevel.name).join(', ') || '—'}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Classes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ink-muted">
            {exam.classes.map((c) => c.classLevel.name).join(' · ') || 'No classes mapped'}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{portal ? 'Exam timetable' : 'Papers · schedule and marks'}</CardTitle>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <>
              <ExamPapersBulkUpload examId={exam.id} locked={exam.status === 'PUBLISHED'} />
              <AddExamPaperForm
                examId={exam.id}
                options={availablePapers.map((row) => ({ id: row.id, label: row.label }))}
                locked={exam.status === 'PUBLISHED'}
              />
              <ExamPapersForm
                examId={exam.id}
                papers={exam.subjects}
                locked={exam.status === 'PUBLISHED'}
              />
            </>
          ) : (
            <ul className="space-y-2 text-sm">
              {exam.subjects.length === 0 ? (
                <li className="text-ink-muted">No papers scheduled yet.</li>
              ) : (
                exam.subjects.map((paper) => (
                  <li key={paper.id} className="rounded-[var(--radius-sm)] border border-line p-3">
                    <p className="font-medium text-ink">
                      {paper.classSubject.classLevel.name} · {paper.classSubject.subject.name}
                    </p>
                    <p className="text-ink-muted">
                      {paper.classSubject.sections.length === 0
                        ? 'All sections'
                        : `Sections: ${paper.classSubject.sections.map((row) => row.section.name).join(', ')}`}
                      {' · '}
                      Max {paper.maxMarks} · Pass {paper.passMarks}
                      {paper.examDate ? ` · ${formatDay(paper.examDate, 'd MMM yyyy')}` : ''}
                      {paper.startTime ? ` · ${paper.startTime}` : ''}
                      {paper.roomName ? ` · ${paper.roomName}` : ''}
                    </p>
                  </li>
                ))
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
