import { requireContext } from '@/server/context'
import { examMarksSetup, marksRoster } from '@/server/modules/exams/service'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { MarksBulkUpload } from './marks-bulk-upload'
import { MarksForm } from './marks-form'
import { MarksPaperFilters } from './marks-paper-filters'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { SheetActions } from '../../marks/sheet-actions'

const STATUS_BADGE = {
  OPEN: { tone: 'neutral', label: 'Open' },
  SUBMITTED: { tone: 'info', label: 'Submitted' },
  LOCKED: { tone: 'brand', label: 'Locked' },
} as const

export const metadata = { title: 'Marks entry' }

export default async function MarksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ subject?: string }>
}) {
  const ctx = await requireContext('exams.marks')
  const { id } = await params
  const { subject } = await searchParams
  const setup = await examMarksSetup(ctx, id)
  const selected = setup.subjects.find((item) => item.id === subject) ?? setup.subjects[0]

  if (!selected) {
    return (
      <div>
        <PageHeader
          title={setup.name}
          breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Marks' }]}
          actions={<BackButton fallbackHref="/exams/marks" />}
        />
        <Card>
          <EmptyState
            title="No papers available"
            description="Ask an administrator to add subjects to this examination."
          />
        </Card>
      </div>
    )
  }

  const roster = await marksRoster(ctx, id, selected.id)
  const paperLabel = `${selected.classSubject.classLevel.name} · ${selected.classSubject.subject.name}`
  const studentRows = roster.rows.map((row) => ({
    studentId: row.studentId,
    rollNumber: row.rollNumber,
    admissionNo: row.student.admissionNo,
    name: `${row.student.firstName} ${row.student.lastName}`,
    marksObtained: row.mark?.marksObtained ?? null,
    internalMarks: row.mark?.internalMarks ?? null,
    oralMarks: row.mark?.oralMarks ?? null,
    isAbsent: row.mark?.isAbsent ?? false,
    notApplicable: row.mark?.notApplicable ?? false,
    remarks: row.mark?.remarks ?? '',
  }))
  // Remounts the grid when saved marks change (e.g. after a sheet upload) so it never shows stale values.
  let savedStamp = 0
  for (const ch of studentRows
    .map((r) => `${r.marksObtained ?? ''}/${r.internalMarks ?? ''}/${r.oralMarks ?? ''}/${r.isAbsent ? 1 : 0}/${r.notApplicable ? 1 : 0}/${r.remarks}`)
    .join(',')) {
    savedStamp = (savedStamp * 31 + ch.charCodeAt(0)) | 0
  }
  const parts = [
    roster.internalMaxMarks ? `internal ${roster.internalMaxMarks}` : null,
    roster.oralMaxMarks ? `oral ${roster.oralMaxMarks}` : null,
  ].filter(Boolean)

  const isAdmin = ctx.can('exams.manage')
  const readOnly = roster.marksStatus === 'LOCKED' || (roster.marksStatus === 'SUBMITTED' && !isAdmin)
  const readOnlyReason = roster.marksStatus === 'LOCKED'
    ? 'Locked — reopen the sheet to change marks.'
    : 'Submitted — an administrator can reopen it for changes.'

  const papers = setup.subjects.map((item) => ({
    id: item.id,
    classLevelId: item.classSubject.classLevel.id,
    className: item.classSubject.classLevel.name,
    subjectId: item.classSubject.subject.id,
    subjectName: item.classSubject.subject.name,
  }))

  return (
    <div className="space-y-4">
      <PageHeader
        title={setup.name}
        breadcrumbs={[{ label: 'Examinations', href: '/exams' }, { label: 'Marks' }]}
        description={`${selected.classSubject.classLevel.name} · ${roster.subject.name} · out of ${roster.maxMarks}${parts.length ? ` (written ${roster.maxMarks - (roster.internalMaxMarks ?? 0) - (roster.oralMaxMarks ?? 0)} + ${parts.join(' + ')})` : ''} · ${roster.rows.length} students`}
        actions={<BackButton fallbackHref="/exams/marks" />}
      />

      <MarksPaperFilters examId={id} papers={papers} selectedId={selected.id} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Sheet status</span>
          <Badge tone={STATUS_BADGE[roster.marksStatus].tone}>{STATUS_BADGE[roster.marksStatus].label}</Badge>
          {readOnly ? <span className="text-xs text-ink-subtle">{readOnlyReason}</span> : null}
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/exams/marks?exam=${id}`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">Marks hub</Link>
          <SheetActions sheetId={selected.id} status={roster.marksStatus} isAdmin={isAdmin} published={roster.exam.status === 'PUBLISHED'} />
        </div>
      </div>

      {readOnly ? null : (
        <div id="bulk-upload" className="scroll-mt-20">
          <MarksBulkUpload
            key={`upload-${selected.id}`}
            examId={id}
            examName={setup.name}
            examSubjectId={selected.id}
            paperLabel={paperLabel}
            students={studentRows}
          />
        </div>
      )}

      <MarksForm
        key={`${selected.id}:${savedStamp}`}
        examId={id}
        examSubjectId={selected.id}
        maxMarks={roster.maxMarks}
        internalMaxMarks={roster.internalMaxMarks}
        oralMaxMarks={roster.oralMaxMarks}
        rows={studentRows}
        readOnly={readOnly}
      />
    </div>
  )
}
