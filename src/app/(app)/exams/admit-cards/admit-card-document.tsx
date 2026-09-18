import { Badge } from '@/components/ui/badge'
import { DocumentLetterhead } from '@/components/print/document-letterhead'
import { QrCode } from '@/components/print/barcode'
import { formatDay } from '@/lib/dates'

export type AdmitCardDocumentPaper = {
  id: string
  examDate: Date | string | null
  startTime: string | null
  endTime: string | null
  roomName: string | null
  classSubject: {
    subject: { name: string; code: string }
  }
}

export type AdmitCardDocumentProps = {
  schoolName: string
  schoolAddress: string
  logoUrl?: string | null
  letterheadHeaderUrl?: string | null
  letterheadFooterUrl?: string | null
  footerText?: string | null
  signatureUrl?: string | null
  examName: string
  sessionName: string
  studentName: string
  admissionNo: string
  photoUrl: string | null
  className: string
  rollNumber: string
  cardNumber: string
  status: string
  verifyToken: string
  dateSheet: AdmitCardDocumentPaper[]
  classNameExtra?: string
}

/** Shared admit-card body used by single and bulk print pages. */
export function AdmitCardDocument({
  schoolName,
  schoolAddress,
  logoUrl,
  letterheadHeaderUrl,
  letterheadFooterUrl,
  footerText,
  signatureUrl,
  examName,
  sessionName,
  studentName,
  admissionNo,
  photoUrl,
  className,
  rollNumber,
  cardNumber,
  status,
  verifyToken,
  dateSheet,
  classNameExtra,
}: AdmitCardDocumentProps) {
  return (
    <DocumentLetterhead
      schoolName={schoolName}
      schoolAddress={schoolAddress}
      logoUrl={logoUrl}
      letterheadHeaderUrl={letterheadHeaderUrl}
      letterheadFooterUrl={letterheadFooterUrl}
      footerText={footerText}
      signatureUrl={signatureUrl}
      className={classNameExtra}
    >
      <header className="border-b border-line pb-4 text-center">
        <p className="caption">Examination admit card</p>
        <p className="mt-3 text-lg font-semibold text-ink">{examName}</p>
        <p className="text-sm text-ink-muted">{sessionName}</p>
      </header>

      <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <div className="mx-auto sm:mx-0">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              className="size-28 rounded-[var(--radius-sm)] border border-line object-cover"
            />
          ) : (
            <div className="size-28 rounded-[var(--radius-sm)] border border-dashed border-line grid place-items-center text-sm text-ink-subtle">
              No photo
            </div>
          )}
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="grid content-start gap-3">
            <div>
              <p className="caption">Student</p>
              <p className="mt-1 text-lg font-semibold text-ink">{studentName}</p>
            </div>
            <div>
              <p className="caption">Class</p>
              <p className="mt-1 font-medium text-ink">{className}</p>
            </div>
            <div>
              <p className="caption">Admit card no.</p>
              <p className="mt-1 font-medium text-ink tnum">{cardNumber}</p>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-start gap-3">
            <div className="grid gap-3">
              <div>
                <p className="caption">Admission no.</p>
                <p className="mt-1 font-medium text-ink">{admissionNo}</p>
              </div>
              <div>
                <p className="caption">Roll no.</p>
                <p className="mt-1 font-medium text-ink">{rollNumber || '—'}</p>
              </div>
              <div>
                <p className="caption">Status</p>
                <p className="mt-1">
                  <Badge tone={status === 'APPROVED' ? 'success' : 'warning'}>
                    {status.toLowerCase()}
                  </Badge>
                </p>
              </div>
            </div>
            <QrCode
              value={`MCV-ADMIT:${verifyToken}`}
              label="Scan for exam attendance"
              className="w-[5.5rem]"
            />
          </div>
        </div>
      </section>

      <section className="py-4">
        <h2 className="mb-3 text-base font-semibold text-ink">Examination date sheet</h2>
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
                <th className="w-[7.5rem] pb-2 font-semibold text-ink-muted">Examiner signature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {dateSheet.map((paper) => (
                <tr key={paper.id}>
                  <td className="py-2 tnum">
                    {paper.examDate
                      ? formatDay(
                          typeof paper.examDate === 'string' ? new Date(paper.examDate) : paper.examDate,
                          'd MMM yyyy',
                        )
                      : '—'}
                  </td>
                  <td className="py-2">
                    {paper.classSubject.subject.name}
                    <span className="ml-1 text-xs text-ink-subtle">{paper.classSubject.subject.code}</span>
                  </td>
                  <td className="py-2 tnum">
                    {paper.startTime
                      ? `${paper.startTime}${paper.endTime ? ` – ${paper.endTime}` : ''}`
                      : '—'}
                  </td>
                  <td className="py-2">{paper.roomName ?? '—'}</td>
                  <td className="py-2 align-bottom">
                    <div className="mt-4 min-h-[1.75rem] border-b border-ink/40" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-8 border-t border-line pt-4 text-sm sm:grid-cols-2">
        {!letterheadFooterUrl && !signatureUrl ? (
          <div>
            <p className="caption">Principal / Authorised signatory</p>
            <div className="mt-8 border-t border-line pt-1 text-ink-muted">Signature & stamp</div>
          </div>
        ) : (
          <div />
        )}
        <div className="sm:text-right">
          <p className="caption">Instructions</p>
          <p className="mt-1 text-ink-muted">
            Bring this admit card and school ID to every paper. Report 15 minutes before the start time.
          </p>
        </div>
      </div>
    </DocumentLetterhead>
  )
}
