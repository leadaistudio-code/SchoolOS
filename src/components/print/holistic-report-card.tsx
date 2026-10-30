import * as React from 'react'
import { UserRound } from 'lucide-react'
import { behaviourLabel, masteryLabel, type ReportCardConfig } from '@/lib/exams/report-card-config'
import { reportCardDesign, type ReportCardDesign } from '@/lib/exams/report-card-designs'
import { reportCardFontCss, type ReportCardFieldKey } from '@/lib/exams/report-card-fields'
import type { ReportCardDocumentData, ReportCardSubjectRow } from '@/lib/exams/report-card-data'
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

/**
 * Text sizes go through `--rc-fs` so the template's font-size setting scales
 * the whole card; colours go through `--rc-ink`, `--rc-label` and `--rc-line`.
 */
const CARD_CSS = `
  .report-card .rc-fs-8 { font-size: calc(8px * var(--rc-fs)); }
  .report-card .rc-fs-9 { font-size: calc(9px * var(--rc-fs)); }
  .report-card .rc-fs-10 { font-size: calc(10px * var(--rc-fs)); }
  .report-card .rc-fs-11 { font-size: calc(11px * var(--rc-fs)); }
  .report-card .rc-fs-115 { font-size: calc(11.5px * var(--rc-fs)); }
  .report-card .rc-fs-12 { font-size: calc(12px * var(--rc-fs)); }
  .report-card .rc-fs-14 { font-size: calc(14px * var(--rc-fs)); line-height: 1.4; }
  .report-card .rc-fs-18 { font-size: calc(18px * var(--rc-fs)); line-height: 1.5; }
  .report-card .rc-fs-20 { font-size: calc(20px * var(--rc-fs)); line-height: 1.4; }
  .report-card .rc-fs-24 { font-size: calc(24px * var(--rc-fs)); line-height: 1.25; }
  .report-card .rc-ink { color: var(--rc-ink); }
  .report-card .rc-soft { color: color-mix(in srgb, var(--rc-ink) 78%, var(--rc-paper)); }
  .report-card .rc-label { color: var(--rc-label); }
  .report-card .rc-head { color: var(--rc-head); }
  .report-card .rc-cell { border: 1px solid var(--rc-line); }
  .report-card .rc-box { border: 1px solid var(--rc-line); }
  .report-card .rc-dots { border-bottom: 1px dotted color-mix(in srgb, var(--rc-line) 60%, var(--rc-label)); }
  @media print {
    @page { size: A4; margin: 6mm; }
    main { padding-top: 0 !important; padding-bottom: 0 !important; }
    body, .bg-bg { background: #fff !important; }
    .rc-sheet { height: 281mm; overflow: hidden; break-after: page; page-break-after: always; break-inside: avoid; }
    .rc-sheet:last-child { break-after: auto; page-break-after: auto; }
    .report-card { width: 198mm; min-width: 0; max-width: none; transform: scale(var(--rc-fit, 1)); transform-origin: top center; }
  }
`

type Fields = ReportCardConfig['fields']
type HeadFont = { className: string; style: React.CSSProperties }

function GradeBadge({ grade, large }: { grade: string | null; large?: boolean }) {
  const colour = gradeColour(grade)
  return (
    <span
      className={large ? 'inline-grid min-w-12 place-items-center rounded-lg px-2 py-1 rc-fs-20 font-bold' : 'inline-grid min-w-8 place-items-center rounded-md px-1.5 py-0.5 rc-fs-12 font-bold'}
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

function SectionBand({ design, font, children }: { design: ReportCardDesign; font: HeadFont; children: React.ReactNode }) {
  const base = `mt-4 mb-2 rc-fs-11 font-bold uppercase tracking-[0.12em] ${font.className}`
  switch (design.section) {
    case 'outline':
      return (
        <h3
          className={`${base} rounded-md px-3 py-1.5`}
          style={{ ...font.style, color: 'var(--rc-head)', border: '1.5px solid var(--rc)', background: 'color-mix(in srgb, var(--rc) 5%, var(--rc-paper))' }}
        >
          {children}
        </h3>
      )
    case 'underline':
      return (
        <h3 className={`${base} pb-1`} style={{ ...font.style, color: 'var(--rc-head)', borderBottom: '2px solid var(--rc)' }}>
          {children}
        </h3>
      )
    case 'pill':
      return (
        <h3 className={base} style={font.style}>
          <span className="inline-block rounded-full px-4 py-1.5 text-white" style={{ background: 'var(--rc)' }}>
            {children}
          </span>
        </h3>
      )
    default:
      return (
        <h3 className={`${base} rounded-md px-3 py-1.5 text-white`} style={{ ...font.style, background: 'var(--rc)' }}>
          {children}
        </h3>
      )
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rc-dots flex items-baseline gap-2 py-1 rc-fs-12">
      <span className="w-28 shrink-0 font-semibold uppercase tracking-wide rc-fs-10 rc-label">{label}</span>
      <span className="min-w-0 font-semibold rc-ink">{value}</span>
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
          style={{ background: score !== null && i <= score ? 'var(--rc)' : 'var(--rc-line)' }}
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
        <span className="rc-fs-24 font-black" style={{ color: 'var(--rc)' }}>
          {initials(school.name)}
        </span>
      )}
    </div>
  )
}

function BoardBadge({ config, onBand }: { config: ReportCardConfig; onBand?: boolean }) {
  if (!config.boardBadge) return null
  return (
    <div
      className="shrink-0 rounded-lg px-3 py-2 text-center"
      style={
        onBand
          ? { border: '1.5px solid rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.12)' }
          : { border: '1.5px solid var(--rc)', background: 'color-mix(in srgb, var(--rc) 6%, var(--rc-paper))' }
      }
    >
      <p className="rc-fs-18 font-black leading-none" style={{ color: onBand ? 'white' : 'var(--rc-head)' }}>{config.boardBadge}</p>
      {config.affiliationNo ? (
        <p className={`mt-1 rc-fs-9 font-semibold uppercase tracking-wide ${onBand ? 'text-white/85' : 'rc-label'}`}>
          Aff. no. {config.affiliationNo}
        </p>
      ) : null}
    </div>
  )
}

function Header({ data, design, fields, font }: { data: ReportCardDocumentData; design: ReportCardDesign; fields: Fields; font: HeadFont }) {
  const { school, config } = data
  const meta = [
    fields.schoolCode.show && school.code ? `${fields.schoolCode.label}: ${school.code}` : null,
    fields.address.show ? school.address : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const contact = fields.contact.show ? school.contact : ''
  const logo = fields.logo.show

  if (design.header === 'band') {
    return (
      <header className="-mx-5 flex items-center gap-4 px-5 py-4 text-white" style={{ background: 'var(--rc)' }}>
        {logo ? <Logo school={school} size="size-20" onBand /> : null}
        <div className="min-w-0 flex-1 text-center">
          <h1 className={`${font.className} rc-fs-24 font-black uppercase tracking-wide`} style={font.style}>{school.name}</h1>
          {config.affiliation ? <p className="mt-0.5 rc-fs-12 font-semibold text-white/90">{config.affiliation}</p> : null}
          {meta ? <p className="mt-0.5 rc-fs-11 text-white/80">{meta}</p> : null}
          {contact ? <p className="rc-fs-11 text-white/75">{contact}</p> : null}
        </div>
        <BoardBadge config={config} onBand />
      </header>
    )
  }

  if (design.header === 'centered') {
    return (
      <header className="flex flex-col items-center pb-3 text-center" style={{ borderBottom: '3px double var(--rc)' }}>
        {logo ? <Logo school={school} size="size-16" /> : null}
        <h1 className={`${font.className} mt-1.5 rc-fs-24 font-black uppercase tracking-wide rc-head`} style={font.style}>
          {school.name}
        </h1>
        {config.affiliation ? <p className="mt-0.5 rc-fs-12 font-semibold rc-soft">{config.affiliation}</p> : null}
        {meta ? <p className="mt-0.5 rc-fs-11 rc-label">{meta}</p> : null}
        {contact ? <p className="rc-fs-11 rc-label">{contact}</p> : null}
        {config.boardBadge ? (
          <p className="mt-1 rc-fs-10 font-bold uppercase tracking-[0.14em] rc-head">
            {config.boardBadge}
            {config.affiliationNo ? ` · Aff. no. ${config.affiliationNo}` : ''}
          </p>
        ) : null}
      </header>
    )
  }

  return (
    <header className="flex items-center gap-4 border-b-2 pb-3" style={{ borderColor: 'var(--rc)' }}>
      {logo ? <Logo school={school} size="size-20" /> : null}
      <div className="min-w-0 flex-1 text-center">
        <h1 className={`${font.className} rc-fs-24 font-black uppercase tracking-wide rc-head`} style={font.style}>
          {school.name}
        </h1>
        {config.affiliation ? <p className="mt-0.5 rc-fs-12 font-semibold rc-soft">{config.affiliation}</p> : null}
        {meta ? <p className="mt-0.5 rc-fs-11 rc-label">{meta}</p> : null}
        {contact ? <p className="rc-fs-11 rc-label">{contact}</p> : null}
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
          <span className="rc-fs-8 font-semibold uppercase tracking-wider text-slate-400">Photo</span>
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
      <div className="border-t border-slate-400 pt-1 rc-fs-11 font-semibold rc-soft">{label}</div>
    </div>
  )
}

/** A mark with its maximum in small type, e.g. 52 /80. */
function Part({ value, max, absent }: { value: number | null; max: number | null; absent: boolean }) {
  if (!max) return <span className="rc-label">—</span>
  if (absent) return <span className="text-rose-600">AB</span>
  return (
    <span className="whitespace-nowrap tnum">
      {value ?? '—'}
      <span className="rc-fs-9 font-normal rc-label"> /{max}</span>
    </span>
  )
}

type Column = {
  key: ReportCardFieldKey
  align: 'left' | 'center'
  cell: (s: ReportCardSubjectRow) => React.ReactNode
  className?: string
}

function subjectColumns(data: ReportCardDocumentData): Column[] {
  const f = data.config.fields
  const anyParts = data.subjects.some((s) => s.parts)
  const anyInternal = data.subjects.some((s) => s.parts?.internalMax)
  const anyOral = data.subjects.some((s) => s.parts?.oralMax)
  const columns: Array<Column | false> = [
    f.colCode.show && { key: 'colCode', align: 'left', className: 'rc-label tnum', cell: (s) => s.code },
    { key: 'colSubject', align: 'left', className: 'font-semibold', cell: (s) => s.name },
    f.colMax.show && { key: 'colMax', align: 'center', className: 'tnum', cell: (s) => s.maxMarks },
    anyParts && f.colWritten.show && {
      key: 'colWritten',
      align: 'center',
      cell: (s) => <Part value={s.parts ? s.parts.written : s.marksObtained} max={s.parts ? s.parts.writtenMax : s.maxMarks} absent={s.isAbsent} />,
    },
    anyInternal && f.colInternal.show && {
      key: 'colInternal',
      align: 'center',
      cell: (s) => <Part value={s.parts?.internal ?? null} max={s.parts?.internalMax ?? null} absent={s.isAbsent} />,
    },
    anyOral && f.colOral.show && {
      key: 'colOral',
      align: 'center',
      cell: (s) => <Part value={s.parts?.oral ?? null} max={s.parts?.oralMax ?? null} absent={s.isAbsent} />,
    },
    f.colObtained.show && {
      key: 'colObtained',
      align: 'center',
      className: 'font-semibold tnum',
      cell: (s) => (s.isAbsent ? <span className="text-rose-600">AB</span> : (s.marksObtained ?? '—')),
    },
    f.colScaled.show && { key: 'colScaled', align: 'center', className: 'font-bold tnum', cell: (s) => (s.isAbsent ? '—' : (s.scaled ?? '—')) },
    f.colGrade.show && { key: 'colGrade', align: 'center', cell: (s) => <GradeBadge grade={s.grade} /> },
    f.colPoints.show && { key: 'colPoints', align: 'center', className: 'tnum', cell: (s) => s.points ?? '—' },
    data.options.showRemarks && {
      key: 'colRemarks',
      align: 'left',
      className: 'rc-fs-11 italic rc-label',
      cell: (s) => s.remarks ?? '—',
    },
  ]
  return columns.filter((c): c is Column => Boolean(c))
}

/**
 * A4 holistic progress card (NEP 2020 / CBSE style). Pure presentation: the
 * live card, the template sample and the design studio render through the
 * same component.
 */
export function HolisticReportCard({ data }: { data: ReportCardDocumentData }) {
  const { config, school, student, totals, options } = data
  const f = config.fields
  const s = config.style
  const base = reportCardDesign(config.design)
  const design: ReportCardDesign = {
    ...base,
    frame: s.frame || base.frame,
    header: s.header || base.header,
    section: s.section || base.section,
    tableHead: s.tableHead || base.tableHead,
    watermark: s.watermark ? s.watermark === 'on' : base.watermark,
  }
  const holistic = config.layout === 'HOLISTIC'
  const frame = frameStyles(design)
  const bodyFont = reportCardFontCss(s.bodyFont)
  const headingCss = reportCardFontCss(s.headingFont)
  const headFont: HeadFont = headingCss
    ? { className: '', style: { fontFamily: headingCss } }
    : { className: base.font === 'serif' ? 'font-serif' : '', style: {} }
  const style = {
    '--rc': config.accent,
    '--rc-head': s.headingColor || config.accent,
    '--rc-ink': s.textColor,
    '--rc-label': s.labelColor,
    '--rc-line': s.lineColor,
    '--rc-paper': s.paperColor,
    '--rc-fs': String(s.fontScale),
    background: s.paperColor,
    color: s.textColor,
    ...(bodyFont ? { fontFamily: bodyFont } : {}),
    printColorAdjust: 'exact',
    WebkitPrintColorAdjust: 'exact',
  } as React.CSSProperties
  const thSolid = design.tableHead === 'solid'
  const headRow: React.CSSProperties = thSolid ? { background: 'var(--rc)' } : { background: 'color-mix(in srgb, var(--rc) 8%, var(--rc-paper))' }
  const th = `px-2 py-1.5 rc-fs-10 font-bold uppercase tracking-wide ${thSolid ? 'border border-white/30 text-white' : 'rc-cell rc-label'}`
  const td = 'rc-cell px-2 py-1.5'
  const attendance = options.showAttendance ? data.attendance : null
  const showSide = config.showPhoto || Boolean(attendance)
  const signatures = config.signatureImages.map((url, i) => url ?? (i === 2 ? school.signatureUrl : null))
  const columns = subjectColumns(data)

  const studentFields: Array<[ReportCardFieldKey, React.ReactNode]> = [
    ['studentName', student.name],
    ['admissionNo', student.admissionNo],
    ['fatherName', student.fatherName],
    ['motherName', student.motherName],
    ['dateOfBirth', formatDate(student.dateOfBirth)],
    ['classSection', `${student.className} – ${student.sectionName}`],
    ['rollNo', student.rollNumber],
    ['bloodGroup', student.bloodGroup],
  ]
  const visibleStudent = studentFields.filter(([key]) => f[key].show)

  const tiles = [
    f.tileTotal.show && { key: 'tileTotal' as const, value: <span className="tnum">{totals.obtained} / {totals.max}</span> },
    f.tilePercent.show && {
      key: 'tilePercent' as const,
      value: <span className="tnum">{totals.percentage}%{totals.cgpa !== null ? ` · ${totals.cgpa}` : ''}</span>,
    },
    f.tileGrade.show && { key: 'tileGrade' as const, value: <GradeBadge grade={totals.grade} large /> },
    f.tileRank.show && {
      key: 'tileRank' as const,
      value: options.showRank && totals.rank ? <span className="tnum">{totals.rank}<span className="rc-fs-14 font-semibold rc-label"> / {totals.classStrength}</span></span> : '—',
    },
  ].filter((t): t is { key: 'tileTotal' | 'tilePercent' | 'tileGrade' | 'tileRank'; value: React.ReactElement } => Boolean(t))

  const remarkBoxes = [
    f.teacherRemark.show && { label: f.teacherRemark.label, text: data.teacherRemark },
    f.principalRemark.show && { label: f.principalRemark.label, text: data.principalRemark },
  ].filter((b): b is { label: string; text: string | null } => Boolean(b))

  return (
    <div className="rc-sheet overflow-x-auto print:overflow-visible">
    <article
      style={style}
      className="report-card relative mx-auto w-full min-w-[190mm] max-w-[210mm] p-[3mm] shadow-sm print:min-w-0 print:shadow-none"
    >
      <ReportCardFit />
      <style>{CARD_CSS}</style>
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
            <span className="absolute right-3 top-3 z-10 rounded border border-amber-400 bg-amber-50 px-2 py-0.5 rc-fs-10 font-bold uppercase tracking-wider text-amber-700 no-print">
              Draft · not published
            </span>
          ) : null}

          <Header data={data} design={design} fields={f} font={headFont} />

          <div className="mt-3 text-center">
            <span
              className={`inline-block px-5 py-1.5 rc-fs-12 font-bold uppercase tracking-[0.14em] ${headFont.className} ${design.section === 'underline' ? 'rounded-none border-y-2 bg-transparent' : 'rounded-full text-white'}`}
              style={design.section === 'underline' ? { ...headFont.style, borderColor: 'var(--rc)', color: 'var(--rc-head)' } : { ...headFont.style, background: 'var(--rc)' }}
            >
              {holistic ? config.title : 'Academic Report Card'}
              {f.session.show && data.sessionName ? ` · ${data.sessionName}` : ''}
            </span>
            {holistic && config.subtitle ? <p className="mt-1 rc-fs-11 italic rc-label">{config.subtitle}</p> : null}
            {f.examName.show ? <p className="mt-0.5 rc-fs-12 font-semibold rc-soft">{data.examName}</p> : null}
          </div>

          {visibleStudent.length > 0 || showSide ? (
            <section className={`mt-3 grid gap-3 ${showSide ? 'grid-cols-[1fr_34mm]' : 'grid-cols-1'}`}>
              <div className="rc-box rounded-lg px-3 py-2">
                <div className="grid h-full grid-cols-2 content-evenly gap-x-6">
                  {visibleStudent.map(([key, value]) => (
                    <Field key={key} label={f[key].label} value={value} />
                  ))}
                </div>
              </div>
              {showSide ? (
                <div className="flex flex-col gap-2">
                  {config.showPhoto ? <StudentPhoto url={student.photoUrl} /> : null}
                  {attendance ? (
                    <div
                      className="flex flex-1 flex-col justify-center rounded-lg px-2.5 py-1.5 text-center"
                      style={{ border: '1px solid color-mix(in srgb, var(--rc) 35%, white)', background: 'color-mix(in srgb, var(--rc) 5%, var(--rc-paper))' }}
                    >
                      <p className="rc-fs-9 font-bold uppercase tracking-wider rc-label">{f.attendance.label}</p>
                      <p className="rc-fs-20 font-black tnum" style={{ color: 'var(--rc-head)' }}>{attendance.percent}%</p>
                      <p className="rc-fs-10 rc-label tnum">
                        {attendance.present} / {attendance.total} days
                      </p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--rc-line)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, attendance.percent)}%`, background: 'var(--rc)' }} />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <SectionBand design={design} font={headFont}>{f.part1.label}</SectionBand>
          <table className="w-full border-collapse rc-fs-12">
            <thead>
              <tr style={headRow}>
                {columns.map((c) => (
                  <th key={c.key} className={`${th} text-${c.align}`}>
                    {f[c.key].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((row) => (
                <tr key={`${row.code}-${row.name}`}>
                  {columns.map((c) => (
                    <td key={c.key} className={`${td} text-${c.align} ${c.className ?? ''}`}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {tiles.length > 0 ? (
            <div
              className="mt-3 grid overflow-hidden rounded-lg text-center"
              style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, border: '1px solid color-mix(in srgb, var(--rc) 35%, white)' }}
            >
              {tiles.map((tile, i) => (
                <div
                  key={tile.key}
                  className="px-2 py-2"
                  style={{
                    background: i % 2 ? 'var(--rc-paper)' : 'color-mix(in srgb, var(--rc) 5%, var(--rc-paper))',
                    borderLeft: i ? '1px solid color-mix(in srgb, var(--rc) 20%, white)' : undefined,
                  }}
                >
                  <p className="rc-fs-10 font-bold uppercase tracking-wider rc-label">{f[tile.key].label}</p>
                  <div className="mt-1 rc-fs-18 font-black" style={{ color: 'var(--rc-head)' }}>{tile.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {holistic && config.showPart2 ? (
            <>
              <SectionBand design={design} font={headFont}>{f.part2.label}</SectionBand>
              <div className="grid grid-cols-2 gap-3">
                <table className="w-full border-collapse rc-fs-115">
                  <thead>
                    <tr style={headRow}>
                      <th className={`${th} text-left`}>{f.competencyHead.label}</th>
                      <th className={`${th} text-center`}>{f.competencyScore.label}</th>
                      {f.competencyMastery.show ? <th className={`${th} text-left`}>{f.competencyMastery.label}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {config.competencies.map((name) => {
                      const score = data.holistic.competencies[name]?.score ?? null
                      return (
                        <tr key={name}>
                          <td className={`${td} font-medium`}>{name}</td>
                          <td className={`${td} text-center`}><ScoreDots score={score} /></td>
                          {f.competencyMastery.show ? <td className={`${td} rc-fs-11 rc-label`}>{masteryLabel(score)}</td> : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <table className="w-full border-collapse rc-fs-115">
                  <thead>
                    <tr style={headRow}>
                      <th className={`${th} text-left`}>{f.coScholasticHead.label}</th>
                      <th className={`${th} text-center`}>{f.coScholasticGrade.label}</th>
                      {f.coScholasticIndicator.show ? <th className={`${th} text-left`}>{f.coScholasticIndicator.label}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {config.coScholastic.map((name) => {
                      const grade = data.holistic.coScholastic[name]?.grade ?? null
                      return (
                        <tr key={name}>
                          <td className={`${td} font-medium`}>{name}</td>
                          <td className={`${td} text-center`}><GradeBadge grade={grade} /></td>
                          {f.coScholasticIndicator.show ? <td className={`${td} rc-fs-11 rc-label`}>{behaviourLabel(grade)}</td> : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {remarkBoxes.length > 0 ? (
            <div className={`mt-4 grid gap-3 ${remarkBoxes.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {remarkBoxes.map((box) => (
                <div key={box.label} className="rc-box rounded-lg px-3 py-2">
                  <p className={`rc-fs-10 font-bold uppercase tracking-wider rc-head ${headFont.className}`} style={headFont.style}>{box.label}</p>
                  <p className="mt-1 min-h-10 rc-fs-12 italic leading-relaxed rc-soft">{box.text || '—'}</p>
                </div>
              ))}
            </div>
          ) : null}

          {f.promotion.show || f.resultBadge.show ? (
            <div
              className="mt-3 flex items-center justify-between gap-3 rounded-lg px-4 py-2"
              style={{ background: 'color-mix(in srgb, var(--rc) 8%, var(--rc-paper))', border: '1px solid color-mix(in srgb, var(--rc) 30%, white)' }}
            >
              {f.promotion.show ? (
                <p className="rc-fs-12">
                  <span className="font-bold uppercase tracking-wider rc-fs-10 rc-label">{f.promotion.label}: </span>
                  <span className="font-bold" style={{ color: 'var(--rc-head)' }}>{data.promotionStatus || (totals.isPass ? 'Promoted' : '—')}</span>
                </p>
              ) : <span />}
              {f.resultBadge.show ? (
                <span
                  className={`rounded-full px-3 py-1 rc-fs-11 font-black uppercase tracking-wider text-white ${totals.isPass ? 'bg-emerald-600' : 'bg-rose-600'}`}
                >
                  {f.resultBadge.label}: {totals.isPass ? 'Pass' : 'Not passed'}
                </span>
              ) : null}
            </div>
          ) : null}

          {f.signatures.show ? (
            <footer className="mt-6 grid grid-cols-[1fr_1fr_auto_1fr] items-end gap-4 text-center">
              <Signatory label={config.signatories[0]} image={signatures[0] ?? null} />
              <Signatory label={config.signatories[1]} image={signatures[1] ?? null} />
              <div className="grid size-20 place-items-center">
                {config.showSeal ? (
                  <div
                    className="grid size-20 place-items-center rounded-full text-center rc-fs-8 font-bold uppercase leading-tight tracking-wider"
                    style={{ border: '2px dashed color-mix(in srgb, var(--rc) 55%, white)', color: 'color-mix(in srgb, var(--rc) 70%, white)' }}
                  >
                    Official<br />seal
                  </div>
                ) : null}
              </div>
              <Signatory label={config.signatories[2]} image={signatures[2] ?? null} />
            </footer>
          ) : null}
          {f.issueDate.show || f.footerNote.show ? (
            <p className="mt-3 flex justify-between rc-fs-10 text-slate-400">
              <span>{f.issueDate.show ? `${f.issueDate.label}: ${formatDate(data.issuedOn)}` : ''}</span>
              <span>{f.footerNote.show ? f.footerNote.label : ''}</span>
            </p>
          ) : null}
        </div>
      </div>
    </article>
    </div>
  )
}
