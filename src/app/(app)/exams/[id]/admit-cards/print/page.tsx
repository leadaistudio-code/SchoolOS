import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listApprovedAdmitCardsForPrint } from '@/server/modules/exams/admit-cards'
import { Notice } from '@/components/ui/states'
import { AdmitCardDocument } from '../../../admit-cards/admit-card-document'
import { PrintAdmitCardButton } from '../../../admit-cards/print-button'

export const metadata = { title: 'Print admit cards' }

function parseSectionIds(raw: string | string[] | undefined): string[] | undefined {
  if (!raw) return undefined
  const values = Array.isArray(raw) ? raw : raw.split(',')
  const ids = values.map((value) => value.trim()).filter(Boolean)
  return ids.length > 0 ? ids : undefined
}

export default async function BulkAdmitCardsPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sections?: string | string[] }>
}) {
  const ctx = await requireContext('exams.view')
  const { id } = await params
  const query = await searchParams
  const sectionIds = parseSectionIds(query.sections)
  const { examName, cards } = await listApprovedAdmitCardsForPrint(ctx, id, sectionIds)
  const school = ctx.tenant.school

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print mb-2 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/exams/${id}/admit-cards`}
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Admit cards
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-muted">
            {cards.length} approved card{cards.length === 1 ? '' : 's'}
            {sectionIds?.length
              ? ` · ${sectionIds.length} section${sectionIds.length === 1 ? '' : 's'}`
              : ' · all sections'}
          </p>
          <PrintAdmitCardButton disabled={cards.length === 0} />
        </div>
      </div>

      {cards.length === 0 ? (
        <Notice tone="warning" title="No approved admit cards">
          {sectionIds?.length
            ? 'No approved cards match the selected sections. Approve cards first, or clear the section filter.'
            : 'Approve admit cards before printing. Generate and approve from the admit cards desk.'}
        </Notice>
      ) : (
        <>
          <style>{`
            @media print {
              .admit-card-page { break-after: page; page-break-after: always; }
              .admit-card-page:last-child { break-after: auto; page-break-after: auto; }
            }
          `}</style>
          {cards.map((item) => (
            <div key={item.card.id} className="admit-card-page">
              <AdmitCardDocument
                schoolName={item.schoolName}
                schoolAddress={item.schoolAddress}
                logoUrl={school?.logoUrl}
                letterheadHeaderUrl={school?.letterheadHeaderUrl}
                letterheadFooterUrl={school?.letterheadFooterUrl}
                footerText={school?.footerText}
                signatureUrl={school?.signatureUrl}
                examName={item.card.exam.name}
                sessionName={item.card.exam.session.name}
                studentName={`${item.card.student.firstName} ${item.card.student.lastName}`}
                admissionNo={item.card.student.admissionNo}
                photoUrl={item.card.student.photoUrl}
                className={item.className}
                rollNumber={item.rollNumber}
                cardNumber={item.card.number}
                status={item.card.status}
                verifyToken={item.card.verifyToken}
                dateSheet={item.dateSheet}
              />
            </div>
          ))}
          <p className="no-print text-xs text-ink-subtle">
            Printing {examName}: use your browser print dialog (Ctrl/Cmd+P). Each card is on its own page.
          </p>
        </>
      )}
    </div>
  )
}
