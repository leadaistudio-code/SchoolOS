import Link from 'next/link'
import { ChevronLeft, ClipboardList } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getReportCard } from '@/server/modules/exams/service'
import { HolisticReportCard } from '@/components/print/holistic-report-card'
import { resultCorrectionSheet } from '@/server/modules/exams/result-correction'
import { PrintReportCardButton } from './print-button'
import { CorrectMarksDialog } from './correct-marks-dialog'

export const metadata = { title: 'Report card' }

/**
 * Report card.
 *
 * This screen is a document: it is printed, signed and filed. The layout and
 * Part 2 sections come from the default report card template.
 */
export default async function ReportCardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('results.view')
  const { id } = await params
  const card = await getReportCard(ctx, id)
  const correction = ctx.can('exams.manage') ? await resultCorrectionSheet(ctx, id).catch(() => null) : null

  return (
    <div className="max-w-[230mm]">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/exams/report-cards?tab=generated"
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
          All report cards
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {ctx.can('exams.marks') ? (
            <Link
              href={`/exams/report-cards?tab=matrix&exam=${card.examId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2"
            >
              <ClipboardList className="size-4" aria-hidden />
              Holistic assessment
            </Link>
          ) : null}
          {correction ? <CorrectMarksDialog resultId={correction.resultId} published={correction.published} papers={correction.papers} /> : null}
          <PrintReportCardButton />
        </div>
      </div>
      <HolisticReportCard data={card} />
    </div>
  )
}
