import { requireContext } from '@/server/context'
import { SECTION_STATUS_LABEL, marksRegister, marksRegisterFilterSchema } from '@/server/modules/exams/marks-register'
import { formatDay } from '@/lib/dates'
import { AutoPrint } from '@/app/(app)/exams/report-cards/engine-controls'
import { PrintButton } from '@/app/(app)/finance/payments/[id]/print-button'
import { RegisterTable } from '../../register-table'

export const metadata = { title: 'Marks register' }

export default async function MarksRegisterPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('exams.marks')
  const params = await searchParams
  const filters = marksRegisterFilterSchema.parse(params)
  const data = await marksRegister(ctx, filters, { perSection: true })
  const { school, exam } = data
  const registers = data.sectionRegisters

  if (!exam) return <p className="p-8 text-sm">No exam with papers to print.</p>

  const generated = formatDay(new Date(), 'd MMM yyyy, h:mm a')
  const title = data.register
    ? `${data.register.className}${data.register.sectionName ? ` · Section ${data.register.sectionName}` : ''}`
    : 'Class & section completion summary'

  const Letterhead = ({ subtitle }: { subtitle: string }) => (
    <header className="mb-3 flex items-center gap-4 border-b-[3px] border-double border-[#1e3a8a] pb-2">
      {school.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={school.logoUrl} alt="" className="size-16 object-contain" />
      ) : null}
      <div className="flex-1 text-center">
        <h1 className="text-[20px] font-bold uppercase tracking-wide text-[#1e3a8a]">{school.name}</h1>
        {school.address ? <p className="text-[10px] text-[#334155]">{school.address}</p> : null}
        {school.contact ? <p className="text-[10px] text-[#334155]">{school.contact}</p> : null}
        <p className="mt-1 inline-block rounded bg-[#1e3a8a] px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">
          Marks register · {exam.name} · {exam.session.name}
        </p>
        <p className="mt-1 text-[12px] font-semibold text-[#0f172a]">{subtitle}</p>
      </div>
      {school.logoUrl ? <div className="size-16" /> : null}
    </header>
  )

  const Signatures = () => (
    <footer className="mt-8 grid grid-cols-3 gap-8 text-center text-[10px] text-[#334155]">
      {['Class Teacher', 'Examination In-charge', 'Principal'].map((label) => (
        <div key={label}>
          {label === 'Principal' && school.signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.signatureUrl} alt="" className="mx-auto h-8 object-contain" />
          ) : (
            <div className="h-8" />
          )}
          <div className="border-t border-[#334155] pt-1 font-semibold">{label}</div>
        </div>
      ))}
    </footer>
  )

  return (
    <div className="marks-register-print bg-white text-[#0f172a]">
      <AutoPrint />
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .register-page { break-after: page; box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
          .register-page:last-child { break-after: auto; }
        }
        .register-table thead { display: table-header-group; }
        .register-table tr { break-inside: avoid; }
      `}</style>
      <div className="no-print mx-auto flex max-w-[297mm] items-center justify-between gap-3 p-4">
        <p className="text-sm text-ink-muted">Choose “Save as PDF” in the print dialog to download. Landscape A4 is set automatically.</p>
        <PrintButton />
      </div>

      <section className="register-page mx-auto mb-6 max-w-[297mm] p-6 shadow-sm">
        <Letterhead subtitle={title} />
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-[#1e3a8a] text-white">
              {['Class', 'Section', 'Students', 'Subjects', 'Marks entered', 'All marks in', 'Locked papers', 'Pass', 'Fail', 'Class avg', 'Status'].map((h) => (
                <th key={h} className="border border-[#1e3a8a] px-2 py-1 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.sections.map((s, i) => (
              <tr key={s.key} className={i % 2 ? 'bg-[#f1f5f9]' : ''}>
                <td className="border border-[#cbd5e1] px-2 py-1 font-medium">{s.className}</td>
                <td className="border border-[#cbd5e1] px-2 py-1">{s.sectionName}</td>
                <td className="border border-[#cbd5e1] px-2 py-1 tnum">{s.students}</td>
                <td className="border border-[#cbd5e1] px-2 py-1 tnum">{s.subjects}</td>
                <td className="border border-[#cbd5e1] px-2 py-1 tnum">{s.entered}/{s.expected} ({s.percent}%)</td>
                <td className="border border-[#cbd5e1] px-2 py-1 tnum">{s.completeStudents}/{s.students}</td>
                <td className="border border-[#cbd5e1] px-2 py-1 tnum">{s.sheetsLocked}/{s.subjects}</td>
                <td className="border border-[#cbd5e1] px-2 py-1 tnum text-[#15803d]">{s.passed}</td>
                <td className="border border-[#cbd5e1] px-2 py-1 tnum text-[#dc2626]">{s.failed}</td>
                <td className="border border-[#cbd5e1] px-2 py-1 tnum">{s.average !== null ? `${s.average}%` : '—'}</td>
                <td
                  className="border border-[#cbd5e1] px-2 py-1 font-semibold"
                  style={{ color: s.status === 'COMPLETED' ? '#15803d' : s.status === 'IN_PROGRESS' ? '#b45309' : '#64748b' }}
                >
                  {SECTION_STATUS_LABEL[s.status]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[9px] text-[#64748b]">
          Generated {generated} · {data.totals.completed} of {data.totals.sections} class-sections complete · {data.totals.completeStudents} of {data.totals.students} students have every mark entered.
        </p>
        {registers.length === 0 ? <Signatures /> : null}
      </section>

      {registers.map((reg) =>
        reg.rows.length ? (
          <section key={`${reg.className}-${reg.sectionName}`} className="register-page mx-auto mb-6 max-w-[297mm] p-6 shadow-sm">
            <Letterhead subtitle={`Class ${reg.className}${reg.sectionName ? ` · Section ${reg.sectionName}` : ''} · ${reg.rows.length} students`} />
            <RegisterTable register={reg} print />
            <p className="mt-2 text-[9px] text-[#64748b]">
              AB = absent · marks in red are below the pass mark · — = subject not taken by the section · grade, result and rank are shown only when every mark is in · Generated {generated}
            </p>
            <Signatures />
          </section>
        ) : null,
      )}
    </div>
  )
}
