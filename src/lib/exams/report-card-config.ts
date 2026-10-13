import { REPORT_CARD_DESIGNS, type ReportCardDesignKey } from './report-card-designs'

export type ReportCardLayout = 'HOLISTIC' | 'CLASSIC'

export type SignatureImages = [string | null, string | null, string | null]

export type ReportCardConfig = {
  layout: ReportCardLayout
  design: ReportCardDesignKey
  showPhoto: boolean
  signatureImages: SignatureImages
  title: string
  subtitle: string
  affiliation: string
  affiliationNo: string
  boardBadge: string
  accent: string
  showPart2: boolean
  showSeal: boolean
  competencies: string[]
  coScholastic: string[]
  signatories: [string, string, string]
}

export const DEFAULT_COMPETENCIES = [
  'Critical thinking & problem solving',
  'Creativity & innovation',
  'Communication skills',
  'Collaboration & teamwork',
  'Digital & information literacy',
]

export const DEFAULT_CO_SCHOLASTIC = [
  'Art education',
  'Health & physical education',
  'Work education',
  'Discipline & conduct',
  'Music & dance',
]

export const CO_SCHOLASTIC_GRADES = ['A+', 'A', 'B', 'C'] as const

export const PROMOTION_OPTIONS = ['Promoted', 'Promoted with distinction', 'Promoted on condition', 'Detained', 'Result withheld'] as const

export const DEFAULT_REPORT_CARD_CONFIG: ReportCardConfig = {
  layout: 'HOLISTIC',
  design: 'heritage',
  showPhoto: true,
  signatureImages: [null, null, null],
  title: 'Holistic Progress Card & Annual Report Card',
  subtitle: 'Comprehensive assessment of scholastic & co-scholastic development',
  affiliation: '',
  affiliationNo: '',
  boardBadge: 'CBSE',
  accent: '#0f5132',
  showPart2: true,
  showSeal: true,
  competencies: DEFAULT_COMPETENCIES,
  coScholastic: DEFAULT_CO_SCHOLASTIC,
  signatories: ['Class Teacher', 'Exam Controller', 'Principal'],
}

const text = (value: unknown, fallback: string, max = 160) =>
  typeof value === 'string' ? value.trim().slice(0, max) : fallback

const list = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 80))
    .filter(Boolean)
  return [...new Set(items)].slice(0, 12)
}

/** Only our own image proxies may be embedded; never an arbitrary external URL. */
const SIGNATURE_IMAGE = /^\/api\/v1\/(files\/[A-Za-z0-9%._~-]+|branding\/signature)$/

function signatureImage(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 300 && SIGNATURE_IMAGE.test(value) ? value : null
}

/** Template `config` JSON is user-editable, so read it defensively. */
export function parseReportCardConfig(raw: unknown): ReportCardConfig {
  const d = DEFAULT_REPORT_CARD_CONFIG
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d }
  const c = raw as Record<string, unknown>
  const signatories = Array.isArray(c.signatories) ? c.signatories : []
  const images = Array.isArray(c.signatureImages) ? c.signatureImages : []
  return {
    layout: c.layout === 'CLASSIC' ? 'CLASSIC' : 'HOLISTIC',
    design: REPORT_CARD_DESIGNS.some((x) => x.key === c.design) ? (c.design as ReportCardDesignKey) : d.design,
    showPhoto: typeof c.showPhoto === 'boolean' ? c.showPhoto : d.showPhoto,
    signatureImages: [signatureImage(images[0]), signatureImage(images[1]), signatureImage(images[2])],
    title: text(c.title, d.title) || d.title,
    subtitle: text(c.subtitle, d.subtitle),
    affiliation: text(c.affiliation, d.affiliation),
    affiliationNo: text(c.affiliationNo, d.affiliationNo, 60),
    boardBadge: text(c.boardBadge, d.boardBadge, 24),
    accent: typeof c.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.accent) ? c.accent : d.accent,
    showPart2: typeof c.showPart2 === 'boolean' ? c.showPart2 : d.showPart2,
    showSeal: typeof c.showSeal === 'boolean' ? c.showSeal : d.showSeal,
    competencies: list(c.competencies, d.competencies),
    coScholastic: list(c.coScholastic, d.coScholastic),
    signatories: [0, 1, 2].map((i) => text(signatories[i], d.signatories[i]!, 40) || d.signatories[i]!) as [string, string, string],
  }
}

/** Splits a textarea (one item per line) into a clean list. */
export function linesToList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export type HolisticData = {
  competencies: Record<string, { score: number | null; note: string | null }>
  coScholastic: Record<string, { grade: string | null; note: string | null }>
}

export function parseHolistic(raw: unknown): HolisticData {
  const empty: HolisticData = { competencies: {}, coScholastic: {} }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty
  const r = raw as Record<string, unknown>
  const out: HolisticData = { competencies: {}, coScholastic: {} }
  if (r.competencies && typeof r.competencies === 'object') {
    for (const [name, value] of Object.entries(r.competencies as Record<string, unknown>)) {
      const v = (value ?? {}) as Record<string, unknown>
      const score = typeof v.score === 'number' && v.score >= 0 && v.score <= 5 ? v.score : null
      out.competencies[name] = { score, note: typeof v.note === 'string' ? v.note : null }
    }
  }
  if (r.coScholastic && typeof r.coScholastic === 'object') {
    for (const [name, value] of Object.entries(r.coScholastic as Record<string, unknown>)) {
      const v = (value ?? {}) as Record<string, unknown>
      out.coScholastic[name] = {
        grade: typeof v.grade === 'string' ? v.grade : null,
        note: typeof v.note === 'string' ? v.note : null,
      }
    }
  }
  return out
}

/** Mastery wording for a 0–5 competency score. */
export function masteryLabel(score: number | null) {
  if (score === null) return '—'
  if (score >= 4.5) return 'Advanced mastery'
  if (score >= 3.5) return 'Proficient'
  if (score >= 2.5) return 'Developing'
  if (score > 0) return 'Beginning'
  return 'Not assessed'
}

/** Behavioural indicator for a co-scholastic grade. */
export function behaviourLabel(grade: string | null) {
  switch (grade) {
    case 'A+': return 'Outstanding'
    case 'A': return 'Excellent'
    case 'B': return 'Very good'
    case 'C': return 'Needs support'
    default: return '—'
  }
}
