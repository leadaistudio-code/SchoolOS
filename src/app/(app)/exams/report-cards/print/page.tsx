import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import { filterReportCards, getReportCard, listPublishedReportCards } from '@/server/modules/exams/service'
import { HolisticReportCard } from '@/components/print/holistic-report-card'
import { Notice } from '@/components/ui/states'
import { PrintReportCardButton } from '../[id]/print-button'

export const metadata = { title: 'Print report cards' }

const MAX_CARDS = 250

export default async function BulkReportCardsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string; class?: string; section?: string }>
}) {
  const ctx = await requireContext('results.view')
  const query = await searchParams
  const all = query.exam ? await listPublishedReportCards(ctx, query.exam) : []
  const { rows, classLevelId, sectionId, classes, sections } = filterReportCards(all, { classLevelId: query.class, sectionId: query.section })
  const picked = rows.slice(0, MAX_CARDS)

  const cards = []
  for (let i = 0; i < picked.length; i += 8) {
    cards.push(...(await Promise.all(picked.slice(i, i + 8).map((row) => getReportCard(ctx, row.id)))))
  }

  const scope = [
    classLevelId ? classes.find((c) => c.id === classLevelId)?.label : 'All classes',
    sectionId ? sections.find((s) => s.id === sectionId)?.label : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const back = `/exams/report-cards?${new URLSearchParams(
    Object.entries({ tab: 'generated', exam: query.exam, class: classLevelId, section: sectionId }).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString()}`

  return (
    <div className="mx-auto max-w-[230mm] space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={back} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden />
          Report cards
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-muted">
            {cards.length} report card{cards.length === 1 ? '' : 's'} · {all[0]?.exam.name ?? 'No exam'} · {scope}
          </p>
          <PrintReportCardButton label={`Print / Save all as PDF`} />
        </div>
      </div>

      {rows.length > MAX_CARDS ? (
        <Notice tone="warning" title={`Showing the first ${MAX_CARDS} of ${rows.length} report cards`} className="no-print">
          Pick a class or section to print the rest.
        </Notice>
      ) : null}

      {cards.length === 0 ? (
        <Notice tone="warning" title="No published report cards">
          Publish the exam&apos;s results first, or change the class and section filters.
        </Notice>
      ) : (
        <>
          <p className="no-print text-xs text-ink-subtle">
            Each report card prints on its own A4 page. In the print dialog choose paper size A4 and keep scale at 100% (Default);
            turn on &quot;Background graphics&quot; for the colours.
          </p>
          <div className="space-y-6 print:space-y-0">
            {cards.map((card) => (
              <HolisticReportCard key={card.resultId} data={card} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
