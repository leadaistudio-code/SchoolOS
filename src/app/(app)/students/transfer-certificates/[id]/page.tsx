import { requireContext } from '@/server/context'
import { getTransferCertificate } from '@/server/modules/students/transfer-certificates'
import { resolveBrandingAssetUrl } from '@/server/branding-assets'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Notice } from '@/components/ui/states'
import { PrintButton } from '@/app/(app)/finance/payments/[id]/print-button'
import { CancelTcDialog } from './cancel-dialog'

export const metadata = { title: 'Transfer certificate' }

const dmy = (v: string | null | undefined) => {
  if (!v) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v
}
const dateOnly = (d: Date | null | undefined) => (d ? formatDay(d, 'dd-MM-yyyy') : '')

export default async function TransferCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('students.tc')
  const { id } = await params
  const { tc, details: d, school } = await getTransferCertificate(ctx, id)
  const logo = resolveBrandingAssetUrl(school?.branding?.logoUrl, 'logo')
  const signature = resolveBrandingAssetUrl(school?.branding?.signatureUrl, 'signature')
  const address = school
    ? [school.addressLine1, school.addressLine2, [school.city, school.state, school.postalCode].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(', ')
    : ''
  const cancelled = tc.status === 'CANCELLED'

  const rows: Array<[string, React.ReactNode]> = [
    ['Name of pupil', d.studentName],
    ['Mother’s name', d.motherName],
    ['Father’s / guardian’s name', d.fatherName],
    ['Nationality', d.nationality],
    ['Whether the candidate belongs to Schedule Caste / Schedule Tribe / OBC', d.belongsToReserved],
    ['Date of first admission in the school with class', [dmy(d.admissionDate), d.admissionClass].filter(Boolean).join(' — ')],
    [
      'Date of birth (in Christian era) according to admission register',
      <>
        <span className="tnum">{dmy(d.dateOfBirth)}</span>
        {d.dateOfBirthWords ? <span className="block text-[11px]">(In words) {d.dateOfBirthWords}</span> : null}
      </>,
    ],
    ['Class in which the pupil last studied (in figures)', d.lastClass],
    ['Class in which the pupil last studied (in words)', d.lastClassWords],
    ['School / board annual examination last taken with result', [d.examTaken, d.examResult].filter(Boolean).join(' — ')],
    ['Whether failed, if so once / twice in the same class', d.failedInSameClass],
    ['Subjects studied', d.subjects],
    ['Whether qualified for promotion to the higher class', d.qualifiedForPromotion],
    ['If so, to which class (in figures)', d.promotedTo],
    ['If so, to which class (in words)', d.promotedToWords],
    ['Month up to which the pupil has paid school dues', d.feesPaidUpto],
    ['Any fee concession availed of; if so, the nature of such concession', d.feeConcession],
    ['Total no. of working days', d.workingDays],
    ['Total no. of working days present', d.daysPresent],
    ['Whether NCC cadet / Boy Scout / Girl Guide (give details)', d.nccScoutGuide],
    ['Games played or extra-curricular activities in which the pupil usually took part', d.gamesActivities],
    ['General conduct', d.generalConduct],
    ['Date of application for certificate', dateOnly(tc.applicationDate)],
    ['Date of issue of certificate', dateOnly(tc.issuedOn)],
    ['Reasons for leaving the school', tc.reason],
    ['Any other remarks', d.remarks],
  ]

  return (
    <div className="space-y-4">
      <div className="no-print space-y-3">
        <PageHeader
          title={`Transfer certificate ${tc.number}`}
          description={`${tc.student.firstName} ${tc.student.lastName} · ${tc.student.admissionNo} · issued by ${tc.issuedByLabel ?? '—'}`}
          actions={
            <>
              <BackButton fallbackHref="/students/transfer-certificates" />
              {!cancelled ? <CancelTcDialog id={tc.id} number={tc.number} /> : null}
              <PrintButton />
            </>
          }
        />
        {cancelled ? (
          <Notice tone="danger" title="This certificate is cancelled">
            {tc.cancelReason ?? ''} {tc.cancelledAt ? `· ${formatDay(tc.cancelledAt, 'd MMM yyyy')}` : ''}
          </Notice>
        ) : tc.loginDisabled ? (
          <Notice tone="info" title="Student login disabled">
            The student was signed out and their portal login switched off when this TC was issued.
          </Notice>
        ) : null}
      </div>

      <article className="tc-sheet relative mx-auto bg-white text-[#111827] shadow-[var(--shadow-card)]">
        {cancelled ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
            <span className="-rotate-30 text-[90px] font-black tracking-widest text-red-600/15">CANCELLED</span>
          </div>
        ) : null}
        <div className="border-[3px] border-double border-[#1f2937] p-[7mm]">
          <header className="flex items-center gap-4 border-b-2 border-[#1f2937] pb-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="size-[22mm] object-contain" />
            ) : (
              <div className="size-[22mm]" />
            )}
            <div className="flex-1 text-center">
              <h1 className="text-[22px] font-extrabold uppercase leading-tight tracking-wide">{school?.name ?? ctx.tenant.name}</h1>
              {school?.legalName && school.legalName !== school.name ? (
                <p className="text-[11px] italic">(Run by {school.legalName})</p>
              ) : null}
              <p className="text-[11px]">{address}</p>
              <p className="text-[11px]">
                {[school?.phone && `Ph: ${school.phone}`, school?.email, school?.website].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-1 text-[11px] font-semibold">
                {[d.affiliationNo && `Affiliation No. ${d.affiliationNo}`, d.schoolCode && `School Code ${d.schoolCode}`]
                  .filter(Boolean)
                  .join('  ·  ')}
                {d.renewedUpto ? <span className="font-normal"> (Renewed upto {d.renewedUpto})</span> : null}
              </p>
            </div>
            <div className="size-[22mm]" />
          </header>

          <h2 className="mx-auto mt-3 w-fit rounded-full bg-[#1f2937] px-6 py-1 text-[14px] font-bold uppercase tracking-[0.2em] text-white">
            Transfer Certificate
          </h2>

          <div className="mt-3 grid grid-cols-3 text-[12px]">
            <p>
              Book No.: <strong>{tc.bookNo ?? '—'}</strong>
            </p>
            <p className="text-center">
              TC No.: <strong className="tnum">{tc.number}</strong>
            </p>
            <p className="text-right">
              Admission No.: <strong className="tnum">{tc.student.admissionNo}</strong>
            </p>
          </div>

          <ol className="mt-3 space-y-[5px] text-[12.5px] leading-snug">
            {rows.map(([label, value], i) => (
              <li key={label} className="grid grid-cols-[7mm_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                <span className="tnum">{i + 1}.</span>
                <span>{label}</span>
                <span className="border-b border-dotted border-[#6b7280] font-semibold">{value || '—'}</span>
              </li>
            ))}
          </ol>

          <footer className="mt-12 grid grid-cols-3 items-end text-center text-[12px]">
            <div>
              <div className="mx-auto h-[14mm]" />
              <p className="border-t border-[#1f2937] pt-1 font-semibold">Signature of Class Teacher</p>
            </div>
            <div>
              <div className="mx-auto h-[14mm]" />
              <p className="border-t border-[#1f2937] pt-1 font-semibold">Checked by (Name &amp; designation)</p>
            </div>
            <div>
              {signature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signature} alt="" className="mx-auto h-[14mm] object-contain" />
              ) : (
                <div className="mx-auto h-[14mm]" />
              )}
              <p className="border-t border-[#1f2937] pt-1 font-semibold">Principal (Seal &amp; signature)</p>
            </div>
          </footer>
        </div>
      </article>

      <style>{`
        .tc-sheet { width: 210mm; min-height: 297mm; padding: 8mm; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          .tc-sheet { box-shadow: none !important; margin: 0 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}
