import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import { isPortalOnlyRole } from '@/server/scope'
import { getAdmitCardPrint } from '@/server/modules/exams/admit-cards'
import { Notice } from '@/components/ui/states'
import { AdmitCardDocument } from '../admit-card-document'
import { PrintAdmitCardButton } from '../print-button'
import { AdmitCardRollbackButton } from '../rollback-button'

export const metadata = { title: 'Admit card' }

export default async function AdmitCardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('exams.view')
  const { id } = await params
  const data = await getAdmitCardPrint(ctx, id)
  const { card, schoolName, schoolAddress, className, rollNumber, dateSheet, canPrint } = data
  const school = ctx.tenant.school
  const portal = isPortalOnlyRole(ctx.user.roleKeys)

  const canApprove = ctx.can('exams.admit_approve')
  const backHref = portal ? '/exams/my-admit-cards' : `/exams/${card.examId}/admit-cards`
  const backLabel = portal ? 'My admit cards' : 'Admit cards'

  if (!canPrint && card.status !== 'APPROVED') {
    return (
      <div className="max-w-lg space-y-4">
        <Notice tone="warning">
          This admit card is not approved yet. The principal must approve it after confirming fees are
          paid.
        </Notice>
        <Link href={backHref} className="text-sm text-brand-600 hover:underline">
          Back to {backLabel.toLowerCase()}
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>
        <div className="flex items-center gap-2">
          {canApprove && card.status === 'APPROVED' ? (
            <AdmitCardRollbackButton id={card.id} examId={card.examId} />
          ) : null}
          <PrintAdmitCardButton />
        </div>
      </div>

      <AdmitCardDocument
        schoolName={schoolName}
        schoolAddress={schoolAddress}
        logoUrl={school?.logoUrl}
        letterheadHeaderUrl={school?.letterheadHeaderUrl}
        letterheadFooterUrl={school?.letterheadFooterUrl}
        footerText={school?.footerText}
        signatureUrl={school?.signatureUrl}
        examName={card.exam.name}
        sessionName={card.exam.session.name}
        studentName={`${card.student.firstName} ${card.student.lastName}`}
        admissionNo={card.student.admissionNo}
        photoUrl={card.student.photoUrl}
        className={className}
        rollNumber={rollNumber}
        cardNumber={card.number}
        status={card.status}
        verifyToken={card.verifyToken}
        dateSheet={dateSheet}
      />
    </div>
  )
}
