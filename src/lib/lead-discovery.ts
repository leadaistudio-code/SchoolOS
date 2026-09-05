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

/** Post-March 2026 cutoff for high-value openings. */
export const DISCOVERY_PRIORITY_CUTOFF = new Date('2026-03-31T23:59:59.000Z')
