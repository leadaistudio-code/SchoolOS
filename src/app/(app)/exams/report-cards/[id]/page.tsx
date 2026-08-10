import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getReportCard } from '@/server/modules/exams/service'
import { formatDay } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { PrintReportCardButton } from './print-button'

export const metadata = { title: 'Report card' }

/**
 * Report card.
 *
 * This screen is a document: it is printed, signed and filed, so it keeps a
 * formal centred masthead and a plain rule structure that survives being sent
 * to a monochrome office printer.
 */
export default async function ReportCardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('results.view')
  const { id } = await params
  const card = await getReportCard(ctx, id)
  const { result } = card

  return (
    <div className="max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link
          href="/exams/report-cards"
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
          All report cards
        </Link>
        <PrintReportCardButton />
      </div>

      <article className="border border-line bg-surface p-5 sm:p-8 print:border-0 print:p-0">
        <header className="border-b border-line pb-4 text-center">
          <p className="caption">Academic report card</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{result.exam.name}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Published {result.publishedAt ? formatDay(result.publishedAt) : '—'}
          </p>
        </header>

        <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-2">
          <div>
            <p className="caption">Student</p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {result.student.firstName} {result.student.lastName}
            </p>
            <p className="text-sm text-ink-muted">
              Admission no. {result.student.admissionNo}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="caption">Class</p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {card.className} · Section {card.sectionName}
            </p>
            <p className="text-sm text-ink-muted">Rank in class {result.rankInClass ?? '—'}</p>
          </div>
        </section>

        <section className="py-4">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="pb-2 text-xs font-semibold text-ink-muted">Subject</th>
                <th className="pb-2 text-xs font-semibold text-ink-muted text-right">Marks</th>
                <th className="pb-2 text-xs font-semibold text-ink-muted text-right">Grade</th>
                <th className="pb-2 text-xs font-semibold text-ink-muted text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {card.subjects.map((subject) => (
                <tr key={subject.code}>
                  <td className="py-2.5">
                    <p className="text-sm font-medium text-ink">{subject.name}</p>
                    <p className="text-xs text-ink-subtle">
                      {subject.code}
                      {subject.remarks ? ` · ${subject.remarks}` : ''}
                    </p>
                  </td>
                  <td className="py-2.5 text-right text-sm tnum">
                    {subject.isAbsent
                      ? 'Absent'
                      : `${subject.marksObtained ?? '—'} / ${subject.maxMarks}`}
                  </td>
                  <td className="py-2.5 text-right text-sm text-ink">{subject.grade ?? '—'}</td>
                  <td className="py-2.5 text-right">
                    <Badge tone={subject.isPass ? 'success' : 'danger'}>
                      {subject.isPass ? 'Pass' : 'Not passed'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <div>
            <p className="caption">Total</p>
            <p className="text-lg font-semibold text-ink tnum">
              {result.totalObtained} / {result.totalMax}
            </p>
          </div>
          <div>
            <p className="caption">Percentage</p>
            <p className="text-lg font-semibold text-ink tnum">{result.percentage}%</p>
          </div>
          <div>
            <p className="caption">Overall grade</p>
            <p className="text-lg font-semibold text-ink">{result.grade ?? '—'}</p>
          </div>
          <div>
            <p className="caption">Outcome</p>
            <p className="mt-1">
              <Badge tone={result.isPass ? 'success' : 'danger'}>
                {result.isPass ? 'Pass' : 'Not passed'}
              </Badge>
            </p>
          </div>
        </footer>
      </article>
    </div>
  )
}
