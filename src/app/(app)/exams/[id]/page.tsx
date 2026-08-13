import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getExamDetail } from '@/server/modules/exams/service'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { ExamMetaForm, ExamPapersForm } from './exam-detail-forms'

export const metadata = { title: 'Exam detail' }

export default async function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('exams.view')
  const { id } = await params
  const exam = await getExamDetail(ctx, id)
  const canManage = ctx.can('exams.manage')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/exams" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden />
          All exams
        </Link>
        <div className="flex flex-wrap gap-2">
          {ctx.can('exams.marks') ? (
            <Link href={`/exams/${exam.id}/marks`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              Enter marks
            </Link>
          ) : null}
          {ctx.can('results.view') ? (
            <Link href={`/exams/results?exam=${exam.id}`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              Results
            </Link>
          ) : null}
        </div>
      </div>

      <PageHeader
        title={exam.name}
        description={`${exam.kind.replaceAll('_', ' ')} · ${exam._count.results} results · ${
          exam.gradingScale?.name ?? 'No grading scale'
        }`}
        actions={<StatusBadge status={exam.status} />}
      />

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
          <CardTitle>Papers · schedule and marks</CardTitle>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <ExamPapersForm
              examId={exam.id}
              papers={exam.subjects}
              locked={exam.status === 'PUBLISHED'}
            />
          ) : (
            <ul className="space-y-2 text-sm">
              {exam.subjects.map((paper) => (
                <li key={paper.id} className="rounded-[var(--radius-sm)] border border-line p-3">
                  <p className="font-medium text-ink">
                    {paper.classSubject.classLevel.name} · {paper.classSubject.subject.name}
                  </p>
                  <p className="text-ink-muted">
                    Max {paper.maxMarks} · Pass {paper.passMarks}
                    {paper.examDate ? ` · ${formatDay(paper.examDate, 'd MMM yyyy')}` : ''}
                    {paper.startTime ? ` · ${paper.startTime}` : ''}
                    {paper.roomName ? ` · ${paper.roomName}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
