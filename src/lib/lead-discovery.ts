/** Constants + pure helpers for AI School Lead Discovery (Growth CRM). */

export const SCHOOL_STATUSES = [
  'NEW_SCHOOL',
  'NEW_BRANCH',
  'NEW_CAMPUS',
  'UPCOMING',
  'EXPANSION',
  'NEW_WING',
  'NEWLY_ANNOUNCED',
  'ACTIVE_ADMISSIONS',
  'HIRING_FOR_NEW_CAMPUS',
] as const

export type SchoolDiscoveryStatus = (typeof SCHOOL_STATUSES)[number]

export const SCHOOL_STATUS_LABELS: Record<SchoolDiscoveryStatus, string> = {
  NEW_SCHOOL: 'New school',
  NEW_BRANCH: 'New branch',
  NEW_CAMPUS: 'New campus',
  UPCOMING: 'Upcoming',
  EXPANSION: 'Expansion',
  NEW_WING: 'New wing',
  NEWLY_ANNOUNCED: 'Newly announced',
  ACTIVE_ADMISSIONS: 'Active admissions',
  HIRING_FOR_NEW_CAMPUS: 'Hiring for new campus',
}

export const SOURCE_TYPE_WEIGHTS: Record<string, number> = {
  OFFICIAL_WEBSITE: 40,
  SCHOOL_GROUP: 40,
  REGULATORY: 40,
  NEWS: 25,
  ADMISSIONS: 25,
  SOCIAL: 20,
  RECRUITMENT: 20,
  JOB_LISTING: 15,
  MAPS: 10,
  DIRECTORY: 5,
  OTHER: 5,
}

export const EXCLUSION_PATTERNS = [
  /\bcoaching\b/i,
  /\btuition\b/i,
  /\buniversity\b/i,
  /\bcollege\b/i,
  /\bIIT\b/,
  /\bNEET\b/,
  /\bJEE\b/,
]

/** Normalize school name for duplicate keys (campus-aware when branch/sector present). */
export function normalizeSchoolKey(input: {
  schoolName: string
  branchName?: string | null
  sector?: string | null
  area?: string | null
  city?: string | null
}): string {
  const base = input.schoolName
    .toLowerCase()
    .replace(/\bdelhi public school\b/g, 'dps')
    .replace(/\bpublic school\b/g, 'ps')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const campus = [input.branchName, input.sector, input.area]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const city = (input.city ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim()
  return [base, campus, city].filter(Boolean).join('|')
}

export function buildSearchQueries(city: string): string[] {
  const templates = [
    `new school ${city} 2026`,
    `new school opening ${city} 2026`,
    `new school opening 2026-27 ${city}`,
    `new campus ${city} school`,
    `school launching ${city}`,
    `new CBSE school ${city}`,
    `school admissions new campus ${city}`,
    `new branch school ${city}`,
    `school hiring new campus ${city}`,
    `school inauguration ${city} 2026`,
    `upcoming school ${city} 2026`,
    `new preschool ${city}`,
    `new international school ${city}`,
    `new school Greater Faridabad 2026`,
  ]
  const sectors =
    /faridabad/i.test(city)
      ? [85, 88, 89].map((s) => `new school Sector ${s} Faridabad`)
      : []
  return [...new Set([...templates.map((t) => t.replace('Greater Faridabad 2026', `${city} 2026`)), ...sectors])]
}

export function opportunityLabel(score: number): string {
  if (score >= 85) return 'Excellent Opportunity'
  if (score >= 70) return 'High Opportunity'
  if (score >= 50) return 'Medium Opportunity'
  return 'Low Opportunity'
}

export function defaultPitch(status: string | null | undefined, session: string | null | undefined): string {
  const when = session ? ` for ${session}` : ' for the upcoming academic session'
  if (status === 'NEW_CAMPUS' || status === 'NEW_BRANCH' || status === 'NEW_SCHOOL') {
    return `Since your campus is being set up${when}, MyCampusView can help establish admissions, attendance, fees, parent communication, assessments, CRM and management dashboards from Day 1 instead of migrating systems later.`
  }
  return `MyCampusView can unify admissions, fees, attendance, parent communication and management intelligence so your team is ready before the next session begins.`
}

/* ------------------------------------------------------------ contact finding */

export type ContactSource =
  | 'OFFICIAL_WEBSITE'
  | 'GOOGLE_MAPS'
  | 'SEARCH_RESULT'
  | 'DIRECTORY'
  | 'DISCOVERY_TEXT'
  | 'DERIVED'

export const CONTACT_SOURCE_LABELS: Record<ContactSource, string> = {
  OFFICIAL_WEBSITE: 'School website',
  GOOGLE_MAPS: 'Google Maps listing',
  SEARCH_RESULT: 'Search result',
  DIRECTORY: 'Directory / social page',
  DISCOVERY_TEXT: 'News / discovery text',
  DERIVED: 'Pieced together from area and city',
}

export type ContactFinding = {
  value: string
  /** 0–100: how sure we are this detail belongs to this school. */
  confidence: number
  source: ContactSource
  url: string | null
  /** Other independent sources that showed the same value. */
  corroboratedBy: number
}

export type ContactFindings = {
  version: 1
  checkedAt: string
  email: ContactFinding | null
  phone: ContactFinding | null
  address: ContactFinding | null
  website: ContactFinding | null
  otherEmails: ContactFinding[]
  otherPhones: ContactFinding[]
  sourcesChecked: string[]
}

export function contactConfidenceLabel(confidence: number): { label: string; tone: 'success' | 'info' | 'warning' } {
  if (confidence >= 80) return { label: 'High', tone: 'success' }
  if (confidence >= 60) return { label: 'Medium', tone: 'info' }
  return { label: 'Low — verify', tone: 'warning' }
}

/** Average of email, phone and address confidence; a missing detail counts as 0. */
export function overallContactConfidence(f: Pick<ContactFindings, 'email' | 'phone' | 'address'>): number {
  return Math.round(((f.email?.confidence ?? 0) + (f.phone?.confidence ?? 0) + (f.address?.confidence ?? 0)) / 3)
}

export function parseContactFindings(value: unknown): ContactFindings | null {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return null
  return value as ContactFindings
}

/** Hosts that list many schools; their own address is never the school's website. */
export const NON_OFFICIAL_HOSTS = [
  'justdial.com',
  'sulekha.com',
  'indiamart.com',
  'yellowpages',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'wikipedia.org',
  'google.com',
  'goo.gl',
  'quora.com',
  'naukri.com',
  'indeed.com',
  'shiksha.com',
  'edustoke.com',
  'schoolmykids.com',
  'uniapply.com',
  'ezyschooling.com',
  'yellowslate.com',
  'skoodos.com',
  'schoolsearch',
  'magicbricks.com',
  '99acres.com',
  'housing.com',
  'timesofindia',
  'hindustantimes.com',
  'indianexpress.com',
  'tribuneindia.com',
  'educationworld.in',
  'ndtv.com',
  'bhaskar.com',
  'jagran.com',
  'amarujala.com',
  'medium.com',
  'blogspot.com',
  'wordpress.com',
]

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

export function isOfficialCandidateHost(url: string | null | undefined): boolean {
  const host = hostOf(url)
  if (!host) return false
  return !NON_OFFICIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h))
}

export function isDirectoryHost(url: string | null | undefined): boolean {
  const host = hostOf(url)
  return !!host && !isOfficialCandidateHost(url)
}

/**
 * Indian numbers to one canonical form: "+91 98765 43210" for mobiles and
 * "+91 129 419 7200" for landlines (STD code without the trunk 0).
 */
export function normalizeIndianPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  for (let i = 0; i < 3 && d.length > 10; i++) {
    if (d.startsWith('91')) d = d.slice(2)
    else if (d.startsWith('0')) d = d.slice(1)
    else break
  }
  if (d.length !== 10) return null
  if (/^(\d)\1{9}$/.test(d) || d === '1234567890' || d.startsWith('0')) return null
  if (/^[6-9]/.test(d)) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`
  return `+91 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
}

const PHONE_CONTEXT = /(phone|ph\.?|tel|call|contact|mob|mobile|helpline|landline|whatsapp|enquir|admission|☎|📞)\s*[:.\-–]?\s*$/i

/**
 * Phone numbers in free text. Without a "Phone:" style label just before it,
 * a number only counts when written with +91 or a leading 0, so pin codes,
 * years and registration numbers are skipped.
 */
export function extractPhones(text: string): string[] {
  const found: string[] = []
  for (const m of text.matchAll(/\+?\d[\d\s().\-]{8,18}\d/g)) {
    const raw = m[0]
    const before = text.slice(Math.max(0, (m.index ?? 0) - 28), m.index ?? 0)
    const prefixed = /^\+\s*91|^0\d|^91[\s\-]/.test(raw.trim())
    if (!prefixed && !PHONE_CONTEXT.test(before)) continue
    const phone = normalizeIndianPhone(raw)
    if (phone && !found.includes(phone)) found.push(phone)
  }
  return found
}

const JUNK_EMAIL_DOMAINS = /(^|\.)(example\.(com|org)|domain\.com|email\.com|yourdomain\.\w+|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|godaddy\.com|schema\.org)$/i

export function extractEmails(text: string): string[] {
  const found: string[] = []
  const plain = text
    .replace(/\s*[[({]\s*at\s*[\])}]\s*/gi, '@')
    .replace(/\s*[[({]\s*dot\s*[\])}]\s*/gi, '.')
  for (const m of plain.matchAll(/[a-z0-9._%+\-]+@[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z]{2,24}/gi)) {
    const email = m[0].toLowerCase().replace(/\.+$/, '')
    const domain = email.split('@')[1] ?? ''
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(email)) continue
    if (JUNK_EMAIL_DOMAINS.test(domain)) continue
    if (/^(no-?reply|donotreply|mailer-daemon)@/.test(email)) continue
    if (!found.includes(email)) found.push(email)
  }
  return found
}

/** Higher for the inboxes a school actually answers. */
export function emailPreference(email: string): number {
  const local = email.split('@')[0] ?? ''
  if (/^(admissions?|admission\.\w+|principal|info|office|contact|enquir(y|ies)|school|reception)/.test(local)) return 2
  if (/(hr|career|jobs|recruit|alumni|webmaster|accounts?|transport)/.test(local)) return 0
  return 1
}

const NAME_STOPWORDS = new Set([
  'school', 'schools', 'the', 'of', 'and', 'sr', 'senior', 'sec', 'secondary', 'public', 'international',
  'global', 'world', 'academy', 'campus', 'branch', 'new', 'a', 'an', 'in', 'at', 'pvt', 'ltd',
])

function nameTokens(name: string): string[] {
  const all = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const strong = all.filter((t) => !NAME_STOPWORDS.has(t))
  return strong.length ? strong : all
}

/** Share of the school name's distinctive words found in the other name (0–1). */
export function nameMatchScore(schoolName: string, other: string): number {
  const mine = nameTokens(schoolName)
  if (mine.length === 0) return 0
  const theirs = new Set(other.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/))
  return mine.filter((t) => theirs.has(t)).length / mine.length
}

/** Post-March 2026 cutoff for high-value openings. */
export const DISCOVERY_PRIORITY_CUTOFF = new Date('2026-03-31T23:59:59.000Z')
