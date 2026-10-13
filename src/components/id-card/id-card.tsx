import * as React from 'react'
import type { IdCardDesign, IdCardOrientation } from '@/lib/id-cards/designs'

export type IdCardPerson = {
  id: string
  name: string
  photoUrl: string | null
  idLabel: string
  idValue: string
  /** STUDENT / TEACHER / STAFF. */
  badge: string
  /** Printed rows, already filtered and ordered. */
  rows: Array<{ label: string; value: string }>
  qr: string | null
  emergency: string | null
  bloodGroup: string | null
}

export type IdCardSchool = {
  name: string
  address: string
  phone: string | null
  email: string | null
  website: string | null
  logoUrl: string | null
  signatureUrl: string | null
  validity: string
}

type Props = {
  design: IdCardDesign
  orientation: IdCardOrientation
  side: 'front' | 'back'
  person: IdCardPerson
  school: IdCardSchool
  showQr: boolean
  rules: string[]
  signatureLabel: string
}

const W = 85.6
const H = 54

export function IdCard(props: Props) {
  const { orientation } = props
  const width = orientation === 'horizontal' ? W : H
  const height = orientation === 'horizontal' ? H : W
  return (
    <div
      className="id-card relative overflow-hidden rounded-[3mm] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_6px_16px_-6px_rgba(0,0,0,0.18)]"
      style={{
        width: `${width}mm`,
        height: `${height}mm`,
        background: props.design.surface,
        color: props.design.ink,
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui)',
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
    >
      {props.side === 'front' ? <Front {...props} /> : <Back {...props} />}
    </div>
  )
}

/* ---------------------------------------------------------------- pieces */

function Logo({ school, size, light }: { school: IdCardSchool; size: number; light?: boolean }) {
  if (school.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={school.logoUrl}
        alt=""
        style={{ width: `${size}mm`, height: `${size}mm`, objectFit: 'contain', background: light ? '#fff' : undefined, borderRadius: '50%', padding: light ? '0.4mm' : 0 }}
      />
    )
  }
  const initials = school.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <span
      style={{ width: `${size}mm`, height: `${size}mm`, fontSize: `${size * 1.3}px` }}
      className="grid shrink-0 place-items-center rounded-full bg-white/90 font-bold text-[#1f2937]"
    >
      {initials}
    </span>
  )
}

function Photo({ person, w, h, design, ring }: { person: IdCardPerson; w: number; h: number; design: IdCardDesign; ring?: string }) {
  const style: React.CSSProperties = {
    width: `${w}mm`,
    height: `${h}mm`,
    borderRadius: '1.6mm',
    border: `0.5mm solid ${ring ?? design.accent}`,
    objectFit: 'cover',
    background: '#f1f5f9',
  }
  return person.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.photoUrl} alt="" style={style} />
  ) : (
    <div style={style} className="grid place-items-center text-[6px] text-[#94a3b8]">
      PHOTO
    </div>
  )
}

function Chip() {
  const id = React.useId()
  return (
    <svg viewBox="0 0 40 30" style={{ width: '8mm', height: '6mm' }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f6e27a" />
          <stop offset="0.5" stopColor="#d4af37" />
          <stop offset="1" stopColor="#b8860b" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="28" rx="5" fill={`url(#${id})`} stroke="#9a7b1c" strokeWidth="0.8" />
      <path d="M1 10h12M1 20h12M27 10h12M27 20h12M13 1v28M27 1v28M13 15h14" stroke="#9a7b1c" strokeWidth="0.8" fill="none" />
    </svg>
  )
}

function Rows({ person, design, size = 6.6, labelWidth = 15 }: { person: IdCardPerson; design: IdCardDesign; size?: number; labelWidth?: number }) {
  return (
    <dl className="grid gap-y-[0.35mm]" style={{ gridTemplateColumns: `${labelWidth}mm 1fr`, fontSize: `${size}px`, lineHeight: 1.25 }}>
      {person.rows.map((r) => (
        <React.Fragment key={r.label}>
          <dt style={{ color: design.muted }}>{r.label}</dt>
          <dd className="truncate font-semibold">{r.value || '—'}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

function Badge({ text, design, inverted }: { text: string; design: IdCardDesign; inverted?: boolean }) {
  return (
    <span
      className="inline-block rounded-full font-bold uppercase tracking-[0.12em]"
      style={{
        fontSize: '5.6px',
        padding: '0.5mm 2mm',
        background: inverted ? '#ffffff' : design.accent,
        color: inverted ? design.primary : contrast(design.accent),
      }}
    >
      {text}
    </span>
  )
}

function Qr({ src, size }: { src: string | null; size: number }) {
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" style={{ width: `${size}mm`, height: `${size}mm`, background: '#fff', padding: '0.6mm', borderRadius: '1mm' }} />
  )
}

function Signature({ school, label, design, light }: { school: IdCardSchool; label: string; design: IdCardDesign; light?: boolean }) {
  return (
    <div className="text-center" style={{ fontSize: '5.4px', color: light ? 'rgba(255,255,255,0.85)' : design.muted }}>
      {school.signatureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={school.signatureUrl} alt="" style={{ height: '4.2mm', margin: '0 auto', objectFit: 'contain' }} />
      ) : (
        <div style={{ height: '4.2mm' }} />
      )}
      <div style={{ borderTop: `0.2mm solid ${light ? 'rgba(255,255,255,0.7)' : design.muted}`, paddingTop: '0.3mm', minWidth: '14mm' }}>{label}</div>
    </div>
  )
}

/** Header background per style; content is laid on top. */
function headerBackground(design: IdCardDesign): React.CSSProperties {
  switch (design.style) {
    case 'minimal':
      return { background: design.surface, borderBottom: `0.4mm solid ${design.primary}` }
    case 'ribbon':
      return { background: design.surface }
    case 'glass':
    case 'wave':
      return { background: 'transparent' }
    default:
      return { background: `linear-gradient(120deg, ${design.primary}, ${design.secondary})` }
  }
}

const headerIsLight = (design: IdCardDesign) => design.style === 'minimal' || design.style === 'ribbon'

function SchoolTitle({ school, design, align = 'left', size = 8.6 }: { school: IdCardSchool; design: IdCardDesign; align?: 'left' | 'center'; size?: number }) {
  const light = headerIsLight(design)
  return (
    <div className="min-w-0 flex-1" style={{ textAlign: align }}>
      <p className="truncate font-extrabold uppercase leading-tight tracking-wide" style={{ fontSize: `${size}px`, color: light ? (design.style === 'ribbon' ? design.accent : design.primary) : '#ffffff' }}>
        {school.name}
      </p>
      <p className="truncate" style={{ fontSize: '5.2px', color: light ? design.muted : 'rgba(255,255,255,0.85)' }}>
        {school.address}
      </p>
    </div>
  )
}

function Backdrop({ design }: { design: IdCardDesign }) {
  const waveId = React.useId()
  if (design.style === 'glass') {
    return (
      <div className="absolute inset-0" aria-hidden style={{ background: `linear-gradient(135deg, ${design.primary}, ${design.secondary})` }}>
        <div className="absolute -right-[10mm] -top-[10mm] size-[30mm] rounded-full bg-white/20" />
        <div className="absolute -bottom-[12mm] -left-[8mm] size-[28mm] rounded-full bg-white/15" />
      </div>
    )
  }
  if (design.style === 'wave') {
    return (
      <svg className="absolute inset-x-0 top-0" viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: '40%' }} aria-hidden>
        <defs>
          <linearGradient id={waveId} x1="0" x2="1">
            <stop offset="0" stopColor={design.primary} />
            <stop offset="1" stopColor={design.secondary} />
          </linearGradient>
        </defs>
        <path d="M0 0H100V26C80 38 60 18 40 28C25 35 12 30 0 34Z" fill={`url(#${waveId})`} />
        <path d="M0 34C12 30 25 35 40 28C60 18 80 38 100 26V30C80 42 60 22 40 32C25 39 12 34 0 38Z" fill={design.accent} opacity="0.7" />
      </svg>
    )
  }
  if (design.style === 'ribbon') {
    return (
      <>
        <div className="absolute inset-x-0 top-0 flex h-[2.4mm] flex-col" aria-hidden>
          <div className="flex-1" style={{ background: '#ff9933' }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: '#138808' }} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[1.6mm]" aria-hidden>
          <div className="flex-1" style={{ background: '#ff9933' }} />
          <div className="flex-1" style={{ background: '#ffffff' }} />
          <div className="flex-1" style={{ background: '#138808' }} />
        </div>
      </>
    )
  }
  return null
}

function Panel({ design, children, className, style }: { design: IdCardDesign; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  if (design.style !== 'glass') return <div className={className} style={style}>{children}</div>
  return (
    <div
      className={className}
      style={{ ...style, background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(6px)', borderRadius: '2.4mm', border: '0.3mm solid rgba(255,255,255,0.9)' }}
    >
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- front */

function Front(props: Props) {
  return props.orientation === 'horizontal' ? <FrontHorizontal {...props} /> : <FrontVertical {...props} />
}

function FrontHorizontal({ design, person, school, showQr, signatureLabel }: Props) {
  if (design.style === 'split') {
    return (
      <div className="absolute inset-0 flex">
        <div className="flex w-[25mm] flex-col items-center justify-between py-[3mm]" style={{ background: `linear-gradient(180deg, ${design.primary}, ${design.secondary})` }}>
          <Logo school={school} size={7} light />
          <Photo person={person} w={17} h={21} design={design} ring="#ffffff" />
          <Badge text={person.badge} design={design} inverted />
        </div>
        <div className="flex min-w-0 flex-1 flex-col px-[3mm] py-[2.6mm]">
          <p className="truncate font-extrabold uppercase" style={{ fontSize: '8px', color: design.primary }}>{school.name}</p>
          <p className="truncate" style={{ fontSize: '5px', color: design.muted }}>{school.address}</p>
          <div className="my-[1.4mm] h-[0.4mm] w-[10mm]" style={{ background: design.accent }} />
          <p className="truncate font-bold" style={{ fontSize: '10px' }}>{person.name}</p>
          <p className="mb-[1mm] font-semibold tabular-nums" style={{ fontSize: '6.4px', color: design.primary }}>{person.idLabel}: {person.idValue}</p>
          <Rows person={person} design={design} size={6.2} labelWidth={13} />
          <div className="mt-auto flex items-end justify-between">
            <span style={{ fontSize: '5.2px', color: design.muted }}>{school.validity}</span>
            {showQr ? <Qr src={person.qr} size={10} /> : <Signature school={school} label={signatureLabel} design={design} />}
          </div>
        </div>
      </div>
    )
  }

  const glass = design.style === 'glass'
  return (
    <>
      <Backdrop design={design} />
      <header className="relative flex h-[12.5mm] items-center gap-[2mm] px-[3.4mm]" style={headerBackground(design)}>
        <Logo school={school} size={8.4} light={!headerIsLight(design)} />
        <SchoolTitle school={school} design={design} />
        <Badge text={person.badge} design={design} inverted={!headerIsLight(design) && design.style !== 'chip'} />
      </header>
      <Panel design={design} className={`relative grid grid-cols-[19mm_1fr] gap-[2.6mm] ${glass ? 'mx-[2.4mm] mt-[1mm] p-[1.8mm]' : 'px-[3.4mm] pt-[2.4mm]'}`}>
        <div className="flex flex-col items-center gap-[1mm]">
          <Photo person={person} w={18} h={22} design={design} />
          {design.style === 'chip' ? <Chip /> : null}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold leading-tight" style={{ fontSize: '10px' }}>{person.name}</p>
          <p className="mb-[0.8mm] font-semibold tabular-nums" style={{ fontSize: '6.4px', color: design.style === 'glass' ? design.secondary : design.primary }}>
            {person.idLabel}: {person.idValue}
          </p>
          <Rows person={person} design={design} size={6.3} labelWidth={14} />
        </div>
      </Panel>
      <footer
        className="absolute inset-x-0 bottom-0 flex h-[6mm] items-center justify-between px-[3.4mm]"
        style={{
          background: design.style === 'minimal' || design.style === 'ribbon' || glass ? 'transparent' : `linear-gradient(90deg, ${design.secondary}, ${design.primary})`,
          bottom: design.style === 'ribbon' ? '1.6mm' : 0,
        }}
      >
        <span style={{ fontSize: '5.4px', color: design.style === 'minimal' || design.style === 'ribbon' ? design.muted : '#ffffffd9' }}>
          {school.validity}
        </span>
        <span style={{ fontSize: '5.4px', color: design.style === 'minimal' || design.style === 'ribbon' ? design.muted : '#ffffffd9' }}>
          {school.phone ? `Ph: ${school.phone}` : ''}
        </span>
      </footer>
      {showQr && person.qr ? (
        <div className="absolute right-[3mm]" style={{ bottom: '6.6mm' }}>
          <Qr src={person.qr} size={10.5} />
        </div>
      ) : null}
    </>
  )
}

function FrontVertical({ design, person, school, showQr, signatureLabel }: Props) {
  const glass = design.style === 'glass'
  const lightHeader = headerIsLight(design)
  return (
    <>
      <Backdrop design={design} />
      <header
        className="relative flex flex-col items-center gap-[1mm] px-[2.6mm] pb-[2mm] pt-[3mm] text-center"
        style={{
          ...headerBackground(design),
          ...(design.style === 'split' || design.style === 'wave' ? { background: `linear-gradient(160deg, ${design.primary}, ${design.secondary})` } : {}),
          paddingTop: design.style === 'ribbon' ? '4mm' : '3mm',
          borderBottomLeftRadius: design.style === 'wave' || design.style === 'split' ? '50% 4mm' : undefined,
          borderBottomRightRadius: design.style === 'wave' || design.style === 'split' ? '50% 4mm' : undefined,
        }}
      >
        <Logo school={school} size={8.5} light={!lightHeader} />
        <SchoolTitle school={school} design={design.style === 'split' || design.style === 'wave' ? { ...design, style: 'band' } : design} align="center" size={7.6} />
      </header>
      <Panel design={design} className={`relative flex flex-col items-center text-center ${glass ? 'mx-[2.4mm] mt-[1.4mm] p-[1.8mm]' : 'px-[3mm] pt-[2mm]'}`}>
        <div className="relative">
          <Photo person={person} w={20} h={24} design={design} />
          {design.style === 'chip' ? (
            <div className="absolute -left-[9mm] top-[2mm]">
              <Chip />
            </div>
          ) : null}
        </div>
        <p className="mt-[1.2mm] w-full truncate font-bold leading-tight" style={{ fontSize: '9.4px' }}>{person.name}</p>
        <div className="my-[0.6mm]">
          <Badge text={person.badge} design={design} />
        </div>
        <p className="mb-[1mm] font-semibold tabular-nums" style={{ fontSize: '6.2px', color: design.primary }}>{person.idLabel}: {person.idValue}</p>
        <div className="w-full text-left">
          <Rows person={{ ...person, rows: person.rows.slice(0, 5) }} design={design} size={6} labelWidth={15} />
        </div>
      </Panel>
      <footer className="absolute inset-x-[3mm] flex items-end justify-between" style={{ bottom: design.style === 'ribbon' ? '3mm' : '2.4mm' }}>
        {showQr && person.qr ? <Qr src={person.qr} size={10} /> : <span />}
        <Signature school={school} label={signatureLabel} design={design} light={glass} />
      </footer>
    </>
  )
}

/* ---------------------------------------------------------------- back */

function Back({ design, orientation, person, school, rules, signatureLabel }: Props) {
  const vertical = orientation === 'vertical'
  return (
    <div className="absolute inset-0 flex flex-col">
      <div
        className="flex items-center justify-center gap-[1.6mm] px-[3mm]"
        style={{ height: vertical ? '9mm' : '7.5mm', background: design.style === 'minimal' ? design.surface : `linear-gradient(120deg, ${design.primary}, ${design.secondary})`, borderBottom: design.style === 'minimal' ? `0.4mm solid ${design.primary}` : undefined }}
      >
        <p className="truncate font-bold uppercase tracking-wide" style={{ fontSize: '7px', color: design.style === 'minimal' ? design.primary : '#ffffff' }}>
          {school.name}
        </p>
      </div>
      <div className="flex flex-1 flex-col px-[3.2mm] py-[2mm]" style={{ fontSize: '5.8px', lineHeight: 1.35 }}>
        <div className="grid gap-x-[2mm] gap-y-[0.4mm]" style={{ gridTemplateColumns: 'auto 1fr' }}>
          {person.emergency ? (
            <>
              <span style={{ color: design.muted }}>Emergency</span>
              <span className="font-semibold tabular-nums">{person.emergency}</span>
            </>
          ) : null}
          {person.bloodGroup ? (
            <>
              <span style={{ color: design.muted }}>Blood group</span>
              <span className="font-semibold">{person.bloodGroup}</span>
            </>
          ) : null}
          <span style={{ color: design.muted }}>{person.idLabel}</span>
          <span className="font-semibold tabular-nums">{person.idValue}</span>
        </div>
        {rules.length ? (
          <ol className="mt-[1.4mm] list-decimal space-y-[0.2mm] pl-[3mm]" style={{ color: design.ink }}>
            {rules.slice(0, vertical ? 6 : 4).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-[2mm]">
          <div className="min-w-0" style={{ fontSize: '5.2px', color: design.muted }}>
            <p className="font-semibold" style={{ color: design.ink }}>If found, please return to:</p>
            <p className="line-clamp-2">{school.address}</p>
            <p>{[school.phone, school.email].filter(Boolean).join(' · ')}</p>
          </div>
          <Signature school={school} label={signatureLabel} design={design} />
        </div>
      </div>
      <div className="h-[1.4mm]" style={{ background: design.accent }} />
    </div>
  )
}

/* ---------------------------------------------------------------- util */

function contrast(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#ffffff'
  const n = parseInt(m[1]!, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff'
}
