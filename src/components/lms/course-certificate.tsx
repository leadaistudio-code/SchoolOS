/* eslint-disable @next/next/no-img-element */
import { formatIst } from '@/lib/ist-clock'
import { lmsCategory, lmsLevelLabel } from '@/lib/lms/options'

export type CourseCertificateData = {
  number: string
  studentName: string
  courseTitle: string
  courseCategory: string
  courseLevel: string
  lessons: number
  minutes: number
  scorePercent: number | null
  issuedAt: Date
  revokedAt: Date | null
}

function hoursLabel(minutes: number) {
  if (!minutes) return null
  if (minutes < 60) return `${minutes} minutes`
  const hours = Math.round((minutes / 60) * 2) / 2
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

/** Landscape A4 completion certificate. Prints on its own; the app chrome is hidden in print. */
export function CourseCertificate({
  data,
  school,
  qr,
  verifyUrl,
}: {
  data: CourseCertificateData
  school: { name: string; city: string | null; logoUrl: string | null; signatureUrl: string | null }
  qr: string | null
  verifyUrl: string
}) {
  const category = lmsCategory(data.courseCategory)
  const facts = [
    `${data.lessons} lesson${data.lessons === 1 ? '' : 's'}`,
    hoursLabel(data.minutes),
    `${lmsLevelLabel(data.courseLevel)} level`,
    data.scorePercent != null ? `Score ${data.scorePercent}%` : null,
  ].filter(Boolean)

  return (
    <>
      <style>{'@page { size: A4 landscape; margin: 8mm; }'}</style>
      <div className="mx-auto w-full max-w-[1000px] print:max-w-none" style={{ containerType: 'inline-size' }}>
      <div
        className="relative aspect-[297/210] w-full overflow-hidden bg-white text-slate-900 shadow-[var(--shadow-pop)] print:shadow-none"
        style={{ ['--accent' as string]: category.colour }}
      >
        <div className="absolute inset-[2.2%] rounded-[6px] border-[3px] border-[var(--accent)]" aria-hidden />
        <div className="absolute inset-[3.4%] rounded-[4px] border border-[var(--accent)] opacity-40" aria-hidden />
        <div
          className="absolute -right-[12%] -top-[30%] size-[55%] rounded-full opacity-[0.07]"
          style={{ background: category.colour }}
          aria-hidden
        />

        <div className="relative flex h-full flex-col items-center px-[9%] pb-[6%] pt-[6.5%] text-center">
          <div className="flex items-center gap-3">
            {school.logoUrl ? <img src={school.logoUrl} alt="" className="h-[5.2cqw] w-auto object-contain" /> : null}
            <div className="text-left">
              <p className="text-[1.8cqw] font-semibold leading-tight">{school.name}</p>
              {school.city ? <p className="text-[1.2cqw] text-slate-500">{school.city}</p> : null}
            </div>
          </div>

          <p className="mt-[3.5%] text-[1.2cqw] font-semibold uppercase tracking-[0.3em]" style={{ color: category.colour }}>
            {category.label}
          </p>
          <h1 className="mt-1 font-serif text-[4.6cqw] font-semibold leading-none tracking-tight">
            Certificate of Completion
          </h1>

          <p className="mt-[3%] text-[1.4cqw] text-slate-500">This certifies that</p>
          <p className="mt-1 border-b border-slate-300 px-6 pb-1 font-serif text-[3.8cqw] italic leading-tight">
            {data.studentName}
          </p>
          <p className="mt-[2%] text-[1.4cqw] text-slate-500">has successfully completed the course</p>
          <p className="mt-1 max-w-[85%] text-[2.4cqw] font-semibold leading-snug">{data.courseTitle}</p>
          <p className="mt-1.5 text-[1.3cqw] text-slate-600">{facts.join('  ·  ')}</p>

          <div className="mt-auto grid w-full grid-cols-3 items-end gap-4 text-[1.15cqw]">
            <div className="text-left">
              <p className="font-semibold">{formatIst(data.issuedAt, 'd MMMM yyyy')}</p>
              <p className="text-slate-500">Date of issue</p>
              <p className="mt-1.5 font-mono text-slate-600">{data.number}</p>
            </div>
            <div className="flex flex-col items-center">
              {school.signatureUrl ? (
                <img src={school.signatureUrl} alt="" className="h-[4.4cqw] w-auto object-contain" />
              ) : (
                <div className="h-[4.4cqw]" />
              )}
              <div className="mt-1 w-[70%] border-t border-slate-400" />
              <p className="mt-1 text-slate-600">Principal</p>
            </div>
            <div className="flex flex-col items-end">
              {qr ? <img src={qr} alt="" className="size-[8.4cqw]" /> : null}
              <p className="mt-1 text-slate-500">Scan to verify</p>
              <p className="max-w-[220px] truncate text-[0.85em] text-slate-400">{verifyUrl.replace(/^https?:\/\//, '')}</p>
            </div>
          </div>
        </div>

        {data.revokedAt ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-label="Revoked">
            <p className="-rotate-12 rounded-md border-[6px] border-red-600/70 px-8 py-2 text-[7cqw] font-black uppercase tracking-widest text-red-600/70">
              Revoked
            </p>
          </div>
        ) : null}
      </div>
      </div>
    </>
  )
}
