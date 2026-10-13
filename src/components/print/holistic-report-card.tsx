import * as React from 'react'
import { UserRound } from 'lucide-react'
import { behaviourLabel, masteryLabel } from '@/lib/exams/report-card-config'
import { reportCardDesign, type ReportCardDesign } from '@/lib/exams/report-card-designs'
import type { ReportCardDocumentData } from '@/lib/exams/report-card-data'
import { ReportCardFit } from './report-card-fit'

const GRADE_COLOURS: Record<string, string> = {
  'A+': '#047857',
  A: '#059669',
  'B+': '#0369a1',
  B: '#0284c7',
  C: '#b45309',
  D: '#c2410c',
  E: '#be123c',
  F: '#be123c',
}

const gradeColour = (grade: string | null) => (grade ? GRADE_COLOURS[grade] ?? '#475569' : '#94a3b8')

function GradeBadge({ grade, large }: { grade: string | null; large?: boolean }) {
  const colour = gradeColour(grade)
  return (
    <span
      className={large ? 'inline-grid min-w-12 place-items-center rounded-lg px-2 py-1 text-xl font-bold' : 'inline-grid min-w-8 place-items-center rounded-md px-1.5 py-0.5 text-xs font-bold'}
      style={{ color: colour, background: `color-mix(in srgb, ${colour} 12%, white)`, border: `1px solid color-mix(in srgb, ${colour} 35%, white)` }}
    >
      {grade ?? '—'}
    </span>
  )
}

function formatDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function SectionBand({ design, children }: { design: ReportCardDesign; children: React.ReactNode }) {
  const base = 'mt-4 mb-2 text-[11px] font-bold uppercase tracking-[0.12em]'
  switch (design.section) {
    case 'outline':
      return (
        <h3
          className={`${base} rounded-md px-3 py-1.5`}
          style={{ color: 'var(--rc)', border: '1.5px solid var(--rc)', background: 'color-mix(in srgb, var(--rc) 5%, white)' }}
        >
          {children}
        </h3>
      )
    case 'underline':
      return (
        <h3 className={`${base} pb-1`} style={{ color: 'var(--rc)', borderBottom: '2px solid var(--rc)' }}>
          {children}
        </h3>
      )
    case 'pill':
      return (
        <h3 className={base}>
          <span className="inline-block rounded-full px-4 py-1.5 text-white" style={{ background: 'var(--rc)' }}>
            {children}
          </span>
        </h3>
      )
    default:
      return (
        <h3 className={`${base} rounded-md px-3 py-1.5 text-white`} style={{ background: 'var(--rc)' }}>
          {children}
        </h3>
      )
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-dotted border-slate-300 py-1 text-[12px]">
      <span className="w-28 shrink-0 font-semibold uppercase tracking-wide text-[10px] text-slate-500">{label}</span>
      <span className="min-w-0 font-semibold text-slate-900">{value}</span>
    </div>
  )
}

function ScoreDots({ score }: { score: number | null }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={score === null ? 'Not assessed' : `${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="size-2.5 rounded-full"
          style={{ background: score !== null && i <= score ? 'var(--rc)' : '#e2e8f0' }}
        />
      ))}
    </span>
  )
}

function frameStyles(design: ReportCardDesign): {
  outer: { className: string; style: React.CSSProperties }
  inner: { className: string; style: React.CSSProperties }
} {
  switch (design.frame) {
    case 'single':
      return {
        outer: { className: 'rounded-sm', style: { border: '1.5px solid var(--rc)' } },
        inner: { className: 'px-5 py-4', style: {} },
      }
    case 'thick':
      return {
        outer: { className: 'rounded-sm p-[1.5mm]', style: { border: '6px solid var(--rc)' } },
        inner: { className: 'px-5 py-4', style: { border: '1.5px solid color-mix(in srgb, var(--rc) 45%, #d4a017)' } },
      }
    case 'stripe':
      return {
        outer: { className: 'overflow-hidden rounded-md', style: { border: '1px solid color-mix(in srgb, var(--rc) 25%, white)' } },
        inner: { className: 'px-5 pb-4', style: {} },
      }
    case 'rounded':
      return {
        outer: { className: 'rounded-3xl p-[1.5mm]', style: { border: '3px solid var(--rc)' } },
        inner: { className: 'overflow-hidden rounded-[20px] px-5 pb-4', style: { border: '1.5px dashed color-mix(in srgb, var(--rc) 45%, white)' } },
      }
    default:
      return {
        outer: { className: 'rounded-sm p-[1.5mm]', style: { border: '3px double var(--rc)' } },
        inner: { className: 'px-5 py-4', style: { border: '1px solid color-mix(in srgb, var(--rc) 40%, white)' } },
      }
  }
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3)
}

function Logo({ school, size, onBand }: { school: ReportCardDocumentData['school']; size: string; onBand?: boolean }) {
  return (
    <div
      className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-white`}
      style={{ border: onBand ? '2px solid white' : '2px solid var(--rc)' }}
    >
      {school.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={school.logoUrl} alt="" className="size-full object-contain p-1" />
      ) : (
        <span className="text-2xl font-black" style={{ color: 'var(--rc)' }}>
          {initials(school.name)}
        </span>
      )}
    </div>
  )
}

function BoardBadge({ config, onBand }: { config: ReportCardDocumentData['config']; onBand?: boolean }) {
  if (!config.boardBadge) return null
  return (
    <div
      className="shrink-0 rounded-lg px-3 py-2 text-center"
      style={
        onBand
          ? { border: '1.5px solid rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.12)' }
          : { border: '1.5px solid var(--rc)', background: 'color-mix(in srgb, var(--rc) 6%, white)' }
      }
    >
      <p className="text-lg font-black leading-none" style={{ color: onBand ? 'white' : 'var(--rc)' }}>{config.boardBadge}</p>
      {config.affiliationNo ? (
        <p className={`mt-1 text-[9px] font-semibold uppercase tracking-wide ${onBand ? 'text-white/85' : 'text-slate-600'}`}>
          Aff. no. {config.affiliationNo}
        </p>
      ) : null}
    </div>
  )
}

function Header({ data, design }: { data: ReportCardDocumentData; design: ReportCardDesign }) {
  const { school, config } = data
  const nameFont = design.font === 'serif' ? 'font-serif' : 'font-sans'
  const meta = [school.code ? `School code: ${school.code}` : null, school.address].filter(Boolean).join(' · ')

  if (design.header === 'band') {
    return (
      <header className="-mx-5 flex items-center gap-4 px-5 py-4 text-white" style={{ background: 'var(--rc)' }}>
        <Logo school={school} size="size-20" onBand />
        <div className="min-w-0 flex-1 text-center">
          <h1 className={`${nameFont} text-2xl font-black uppercase leading-tight tracking-wide`}>{school.name}</h1>
          {config.affiliation ? <p className="mt-0.5 text-[12px] font-semibold text-white/90">{config.affiliation}</p> : null}
          {meta ? <p className="mt-0.5 text-[11px] text-white/80">{meta}</p> : null}
          {school.contact ? <p className="text-[11px] text-white/75">{school.contact}</p> : null}
        </div>
        <BoardBadge config={config} onBand />
      </header>
    )
  }

  if (design.header === 'centered') {
    return (
      <header className="flex flex-col items-center pb-3 text-center" style={{ borderBottom: '3px double var(--rc)' }}>
        <Logo school={school} size="size-16" />
        <h1 className={`${nameFont} mt-1.5 text-2xl font-black uppercase leading-tight tracking-wide`} style={{ color: 'var(--rc)' }}>
          {school.name}
        </h1>
        {config.affiliation ? <p className="mt-0.5 text-[12px] font-semibold text-slate-700">{config.affiliation}</p> : null}
        {meta ? <p className="mt-0.5 text-[11px] text-slate-600">{meta}</p> : null}
        {school.contact ? <p className="text-[11px] text-slate-500">{school.contact}</p> : null}
        {config.boardBadge ? (
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--rc)' }}>
            {config.boardBadge}
            {config.affiliationNo ? ` · Aff. no. ${config.affiliationNo}` : ''}
          </p>
        ) : null}
      </header>
    )
  }

  return (
    <header className="flex items-center gap-4 border-b-2 pb-3" style={{ borderColor: 'var(--rc)' }}>
      <Logo school={school} size="size-20" />
      <div className="min-w-0 flex-1 text-center">
        <h1 className={`${nameFont} text-2xl font-black uppercase leading-tight tracking-wide`} style={{ color: 'var(--rc)' }}>
          {school.name}
        </h1>
        {config.affiliation ? <p className="mt-0.5 text-[12px] font-semibold text-slate-700">{config.affiliation}</p> : null}
        {meta ? <p className="mt-0.5 text-[11px] text-slate-600">{meta}</p> : null}
        {school.contact ? <p className="text-[11px] text-slate-500">{school.contact}</p> : null}
      </div>
      <BoardBadge config={config} />
    </header>
  )
}

function StudentPhoto({ url }: { url: string | null }) {
  return (
    <div
      className="grid h-[40mm] w-full shrink-0 place-items-center overflow-hidden rounded-md bg-slate-50"
      style={{ border: '1.5px solid color-mix(in srgb, var(--rc) 45%, white)' }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-1 text-slate-300">
          <UserRound className="size-10" strokeWidth={1.5} aria-hidden />
          <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">Photo</span>
        </span>
      )}
    </div>
  )
}

function Signatory({ label, image }: { label: string; image: string | null }) {
  return (
    <div>
      <div className="flex h-12 items-end justify-center">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="max-h-12 max-w-full object-contain" />
        ) : null}
      </div>
      <div className="border-t border-slate-400 pt-1 text-[11px] font-semibold text-slate-700">{label}</div>
    </div>
  )
}

/**
 * A4 holistic progress card (NEP 2020 / CBSE style). Pure presentation: the
 * live card, the template sample and the design studio render through the
 * same component.
 */
export function HolisticReportCard({ data }: { data: ReportCardDocumentData }) {
  const { config, school, student, totals, options } = data
  const design = reportCardDesign(config.design)
  const holistic = config.layout === 'HOLISTIC'
  const frame = frameStyles(design)
  const style = { '--rc': config.accent, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as React.CSSProperties
  const headingFont = design.font === 'serif' ? 'font-serif' : ''
  const thSolid = design.tableHead === 'solid'
  const headRow: React.CSSProperties = thSolid ? { background: 'var(--rc)' } : { background: 'color-mix(in srgb, var(--rc) 8%, white)' }
  const th = `border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${thSolid ? 'border-white/30 text-white' : 'border-slate-200 text-slate-600'}`
  const attendance = options.showAttendance ? data.attendance : null
  const showSide = config.showPhoto || Boolean(attendance)
  const signatures = config.signatureImages.map((url, i) => url ?? (i === 2 ? school.signatureUrl : null))

  return (
    <div className="rc-sheet overflow-x-auto print:overflow-visible">
    <article
      style={style}
      className="report-card relative mx-auto w-full min-w-[190mm] max-w-[210mm] bg-white p-[3mm] text-slate-900 shadow-sm print:min-w-0 print:shadow-none"
    >
      <ReportCardFit />
      <style>{`
        @media print {
          @page { size: A4; margin: 6mm; }
          main { padding-top: 0 !important; padding-bottom: 0 !important; }
          body, .bg-bg { background: #fff !important; }
          .rc-sheet { height: 281mm; overflow: hidden; break-after: page; page-break-after: always; break-inside: avoid; }
          .rc-sheet:last-child { break-after: auto; page-break-after: auto; }
          .report-card { width: 198mm; min-width: 0; max-width: none; transform: scale(var(--rc-fit, 1)); transform-origin: top center; }
        }
      `}</style>
      <div className={frame.outer.className} style={frame.outer.style}>
        {design.frame === 'stripe' ? <div className="h-2" style={{ background: 'var(--rc)', opacity: 0.55 }} /> : null}
        <div className={`relative ${frame.inner.className}`} style={frame.inner.style}>
          {design.watermark ? (
            <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden" style={{ opacity: 0.05 }}>
              {school.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={school.logoUrl} alt="" className="w-[110mm] object-contain grayscale" />
              ) : (
                <span className="font-serif text-[60mm] font-black leading-none" style={{ color: 'var(--rc)' }}>
                  {initials(school.name)}
                </span>
              )}
            </div>
          ) : null}
          {data.draft ? (
            <span className="absolute right-3 top-3 z-10 rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 no-print">
              Draft · not published
            </span>
          ) : null}

          <Header data={data} design={design} />

          <div className="mt-3 text-center">
            <span
              className={`inline-block px-5 py-1.5 text-[12px] font-bold uppercase tracking-[0.14em] ${headingFont} ${design.section === 'underline' ? 'rounded-none border-y-2 bg-transparent' : 'rounded-full text-white'}`}
              style={design.section === 'underline' ? { borderColor: 'var(--rc)', color: 'var(--rc)' } : { background: 'var(--rc)' }}
            >
              {holistic ? config.title : 'Academic Report Card'}
              {data.sessionName ? ` · ${data.sessionName}` : ''}
            </span>
            {holistic && config.subtitle ? <p className="mt-1 text-[11px] italic text-slate-500">{config.subtitle}</p> : null}
            <p className="mt-0.5 text-[12px] font-semibold text-slate-700">{data.examName}</p>
          </div>

          <section className={`mt-3 grid gap-3 ${showSide ? 'grid-cols-[1fr_34mm]' : 'grid-cols-1'}`}>
            <div className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
              <div className="grid h-full grid-cols-2 content-evenly gap-x-6">
                <Field label="Student name" value={student.name} />
                <Field label="Admission no." value={student.admissionNo} />
                <Field label="Father's name" value={student.fatherName} />
                <Field label="Mother's name" value={student.motherName} />
                <Field label="Date of birth" value={formatDate(student.dateOfBirth)} />
                <Field label="Class & section" value={`${student.className} – ${student.sectionName}`} />
                <Field label="Roll no." value={student.rollNumber} />
                <Field label="Blood group" value={student.bloodGroup} />
              </div>
            </div>
            {showSide ? (
              <div className="flex flex-col gap-2">
                {config.showPhoto ? <StudentPhoto url={student.photoUrl} /> : null}
                {attendance ? (
                  <div
                    className="flex flex-1 flex-col justify-center rounded-lg px-2.5 py-1.5 text-center"
                    style={{ border: '1px solid color-mix(in srgb, var(--rc) 35%, white)', background: 'color-mix(in srgb, var(--rc) 5%, white)' }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Attendance</p>
                    <p className="text-xl font-black leading-tight tnum" style={{ color: 'var(--rc)' }}>{attendance.percent}%</p>
                    <p className="text-[10px] text-slate-600 tnum">
                      {attendance.present} / {attendance.total} days
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, attendance.percent)}%`, background: 'var(--rc)' }} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <SectionBand design={design}>Part 1 · Scholastic achievement</SectionBand>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr style={headRow}>
                {['Code', 'Subject', 'Max', 'Obtained', 'Score (100)', 'Grade', 'GP', ...(options.showRemarks ? ['Qualitative remarks'] : [])].map((h, i) => (
                  <th key={h} className={`${th} ${i >= 2 && i <= 6 ? 'text-center' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((s) => (
                <tr key={`${s.code}-${s.name}`}>
                  <td className="border border-slate-200 px-2 py-1.5 text-slate-500 tnum">{s.code}</td>
                  <td className="border border-slate-200 px-2 py-1.5 font-semibold">{s.name}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-center tnum">{s.maxMarks}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold tnum">
                    {s.isAbsent ? <span className="text-rose-600">AB</span> : (s.marksObtained ?? '—')}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-center font-bold tnum">{s.isAbsent ? '—' : (s.scaled ?? '—')}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-center"><GradeBadge grade={s.grade} /></td>
                  <td className="border border-slate-200 px-2 py-1.5 text-center tnum">{s.points ?? '—'}</td>
                  {options.showRemarks ? (
                    <td className="border border-slate-200 px-2 py-1.5 text-[11px] italic text-slate-600">{s.remarks ?? '—'}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-lg text-center" style={{ border: '1px solid color-mix(in srgb, var(--rc) 35%, white)' }}>
            {[
              { label: 'Grand total', value: <span className="tnum">{totals.obtained} / {totals.max}</span> },
              { label: 'Percentage · CGPA', value: <span className="tnum">{totals.percentage}%{totals.cgpa !== null ? ` · ${totals.cgpa}` : ''}</span> },
              { label: 'Overall grade', value: <GradeBadge grade={totals.grade} large /> },
              {
                label: 'Class standing',
                value: options.showRank && totals.rank ? <span className="tnum">{totals.rank}<span className="text-sm font-semibold text-slate-500"> / {totals.classStrength}</span></span> : '—',
              },
            ].map((tile, i) => (
              <div
                key={tile.label}
                className="px-2 py-2"
                style={{ background: i % 2 ? 'white' : 'color-mix(in srgb, var(--rc) 5%, white)', borderLeft: i ? '1px solid color-mix(in srgb, var(--rc) 20%, white)' : undefined }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{tile.label}</p>
                <div className="mt-1 text-lg font-black" style={{ color: 'var(--rc)' }}>{tile.value}</div>
              </div>
            ))}
          </div>

          {holistic && config.showPart2 ? (
            <>
              <SectionBand design={design}>Part 2 · Holistic development</SectionBand>
              <div className="grid grid-cols-2 gap-3">
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr style={headRow}>
                      <th className={`${th} text-left`}>21st-century competency</th>
                      <th className={`${th} text-center`}>Score / 5</th>
                      <th className={`${th} text-left`}>Mastery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.competencies.map((name) => {
                      const score = data.holistic.competencies[name]?.score ?? null
                      return (
                        <tr key={name}>
                          <td className="border border-slate-200 px-2 py-1.5 font-medium">{name}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center"><ScoreDots score={score} /></td>
                          <td className="border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600">{masteryLabel(score)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr style={headRow}>
                      <th className={`${th} text-left`}>Co-scholastic domain</th>
                      <th className={`${th} text-center`}>Grade</th>
                      <th className={`${th} text-left`}>Indicator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.coScholastic.map((name) => {
                      const grade = data.holistic.coScholastic[name]?.grade ?? null
                      return (
                        <tr key={name}>
                          <td className="border border-slate-200 px-2 py-1.5 font-medium">{name}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-center"><GradeBadge grade={grade} /></td>
                          <td className="border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600">{behaviourLabel(grade)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { label: "Class teacher's observation", text: data.teacherRemark },
              { label: "Principal's remarks", text: data.principalRemark },
            ].map((box) => (
              <div key={box.label} className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--rc)' }}>{box.label}</p>
                <p className="mt-1 min-h-10 text-[12px] italic leading-relaxed text-slate-700">{box.text || '—'}</p>
              </div>
            ))}
          </div>

          <div
            className="mt-3 flex items-center justify-between gap-3 rounded-lg px-4 py-2"
            style={{ background: 'color-mix(in srgb, var(--rc) 8%, white)', border: '1px solid color-mix(in srgb, var(--rc) 30%, white)' }}
          >
            <p className="text-[12px]">
              <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500">Promotion status: </span>
              <span className="font-bold" style={{ color: 'var(--rc)' }}>{data.promotionStatus || (totals.isPass ? 'Promoted' : '—')}</span>
            </p>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white ${totals.isPass ? 'bg-emerald-600' : 'bg-rose-600'}`}
            >
              Result: {totals.isPass ? 'Pass' : 'Not passed'}
            </span>
          </div>

          <footer className="mt-6 grid grid-cols-[1fr_1fr_auto_1fr] items-end gap-4 text-center">
            <Signatory label={config.signatories[0]} image={signatures[0] ?? null} />
            <Signatory label={config.signatories[1]} image={signatures[1] ?? null} />
            <div className="grid size-20 place-items-center">
              {config.showSeal ? (
                <div
                  className="grid size-20 place-items-center rounded-full text-center text-[8px] font-bold uppercase leading-tight tracking-wider"
                  style={{ border: '2px dashed color-mix(in srgb, var(--rc) 55%, white)', color: 'color-mix(in srgb, var(--rc) 70%, white)' }}
                >
                  Official<br />seal
                </div>
              ) : null}
            </div>
            <Signatory label={config.signatories[2]} image={signatures[2] ?? null} />
          </footer>
          <p className="mt-3 flex justify-between text-[10px] text-slate-400">
            <span>Date of issue: {formatDate(data.issuedOn)}</span>
            <span>This is a computer-generated report card.</span>
          </p>
        </div>
      </div>
    </article>
    </div>
  )
}
