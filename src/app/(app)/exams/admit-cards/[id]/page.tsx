import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getAdmitCardPrint } from '@/server/modules/exams/admit-cards'
import { formatDay } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { PrintAdmitCardButton } from '../print-button'

export const metadata = { title: 'Admit card' }

export default async function AdmitCardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('exams.view')
  const { id } = await params
  const data = await getAdmitCardPrint(ctx, id)
  const { card, schoolName, schoolAddress, className, rollNumber, dateSheet, canPrint } = data

  if (!canPrint && card.status !== 'APPROVED') {
    return (
      <div className="max-w-lg space-y-4">
        <Notice tone="warning">
          This admit card is not approved yet. The principal must approve it after confirming fees are
          paid.
        </Notice>
        <Link href={`/exams/${card.examId}/admit-cards`} className="text-sm text-brand-600 hover:underline">
          Back to admit cards
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link
          href={`/exams/${card.examId}/admit-cards`}
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Admit cards
        </Link>
        <PrintAdmitCardButton />
      </div>

      <article className="border border-line bg-surface p-5 sm:p-8 print:border-0 print:p-0">
        <header className="border-b border-line pb-4 text-center">
          <p className="caption">Examination admit card</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{schoolName}</h1>
          {schoolAddress ? <p className="text-sm text-ink-muted">{schoolAddress}</p> : null}
          <p className="mt-3 text-lg font-semibold text-ink">{card.exam.name}</p>
          <p className="text-sm text-ink-muted">{card.exam.session.name}</p>
        </header>

        <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <div className="mx-auto sm:mx-0">
            {card.student.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.student.photoUrl}
                alt=""
                className="size-28 rounded-[var(--radius-sm)] border border-line object-cover"
              />
            ) : (
              <div className="size-28 rounded-[var(--radius-sm)] border border-dashed border-line grid place-items-center text-sm text-ink-subtle">
                No photo
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <p className="caption">Student</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {card.student.firstName} {card.student.lastName}
              </p>
            </div>
            <div>
              <p className="caption">Admission no.</p>
              <p className="mt-1 font-medium text-ink">{card.student.admissionNo}</p>
            </div>
            <div>
              <p className="caption">Class</p>
              <p className="mt-1 font-medium text-ink">{className}</p>
            </div>
            <div>
              <p className="caption">Roll no.</p>
              <p className="mt-1 font-medium text-ink">{rollNumber ?? '—'}</p>
            </div>
            <div>
              <p className="caption">Admit card no.</p>
              <p className="mt-1 font-medium text-ink tnum">{card.number}</p>
            </div>
            <div>
              <p className="caption">Status</p>
              <p className="mt-1">
                <Badge tone={card.status === 'APPROVED' ? 'success' : 'warning'}>
                  {card.status.toLowerCase()}
                </Badge>
              </p>
            </div>
          </div>
        </section>

        <section className="py-4">
          <h2 className="text-base font-semibold text-ink mb-3">Examination date sheet</h2>
          {dateSheet.length === 0 ? (
            <p className="text-sm text-ink-muted">No paper schedule has been entered for this class yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="pb-2 font-semibold text-ink-muted">Date</th>
                  <th className="pb-2 font-semibold text-ink-muted">Subject</th>
                  <th className="pb-2 font-semibold text-ink-muted">Time</th>
                  <th className="pb-2 font-semibold text-ink-muted">Room</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dateSheet.map((paper) => (
                  <tr key={paper.id}>
                    <td className="py-2 tnum">
                      {paper.examDate ? formatDay(paper.examDate, 'd MMM yyyy') : '—'}
                    </td>
                    <td className="py-2">
                      {paper.classSubject.subject.name}
                      <span className="ml-1 text-xs text-ink-subtle">{paper.classSubject.subject.code}</span>
                    </td>
                    <td className="py-2 tnum">
                      {paper.startTime ? `${paper.startTime}${paper.endTime ? ` – ${paper.endTime}` : ''}` : '—'}
                    </td>
                    <td className="py-2">{paper.roomName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="border-t border-line pt-4 grid gap-8 sm:grid-cols-2 text-sm">
          <div>
            <p className="caption">Principal / Authorised signatory</p>
            <div className="mt-8 border-t border-line pt-1 text-ink-muted">Signature & stamp</div>
          </div>
          <div className="sm:text-right">
            <p className="caption">Instructions</p>
            <p className="mt-1 text-ink-muted">
              Bring this admit card and school ID to every paper. Report 15 minutes before the start time.
            </p>
          </div>
        </footer>
      </article>
    </div>
  )
}
