import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getExamAttendanceDesk } from '@/server/modules/exams/attendance'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Notice } from '@/components/ui/states'
import { ExamAttendanceDesk } from './attendance-desk'

export const metadata = { title: 'Exam attendance' }

export default async function ExamAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('exams.attendance')
  const { id } = await params
  const query = await searchParams
  const data = await getExamAttendanceDesk(ctx, id, query.date)

  const dates = data.dates.map((day) => ({
    key: day.key,
    label: formatDay(day.examDate, 'd MMM yyyy'),
    paperCount: day.paperCount,
  }))

  return (
    <div className="space-y-4">
      <Link
        href={`/exams/${id}`}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {data.exam.name}
      </Link>

      <PageHeader
        title="Exam attendance"
        description="Pick the exam date, then scan admit cards. Attendance is saved for every paper on that day."
      />

      {!data.selectedDate ? (
        <Notice tone="warning" title="Add the paper schedule first">
          This exam has no dated papers available for attendance.
        </Notice>
      ) : (
        <ExamAttendanceDesk
          examId={id}
          selectedDate={data.selectedDate}
          dates={dates}
          dayPapers={data.dayPapers}
          rows={data.rows.map((row) => {
            const enrollment = row.student.enrollments[0]!
            return {
              admitCardNumber: row.admitCardNumber,
              paperCount: row.paperCount,
              student: {
                id: row.student.id,
                firstName: row.student.firstName,
                lastName: row.student.lastName,
                admissionNo: row.student.admissionNo,
                photoUrl: row.student.photoUrl,
                className: enrollment.classLevel.name,
                sectionName: enrollment.section.name,
                rollNumber: enrollment.rollNumber,
              },
              attendance: row.attendance
                ? {
                    status: row.attendance.status,
                    source: row.attendance.source,
                    checkedInAt: row.attendance.checkedInAt?.toISOString() ?? null,
                    updatedAt: row.attendance.updatedAt.toISOString(),
                  }
                : null,
            }
          })}
        />
      )}
    </div>
  )
}
