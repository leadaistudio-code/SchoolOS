import { z } from 'zod'
import {
  DISCOVERY_PRIORITY_CUTOFF,
  EXCLUSION_PATTERNS,
  SCHOOL_STATUSES,
  defaultPitch,
  normalizeSchoolKey,
} from '@/lib/lead-discovery'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import { annotateHit, type SearchHit } from './provider'

const extractionSchema = z.object({
  schoolName: z.string().min(2).max(200),
  branchName: z.string().nullable().optional(),
  schoolGroup: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  openingMonth: z.number().int().min(1).max(12).nullable().optional(),
  openingYear: z.number().int().min(2020).max(2035).nullable().optional(),
  academicSession: z.string().nullable().optional(),
  schoolStatus: z.enum(SCHOOL_STATUSES).nullable().optional(),
  contactPerson: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  alternatePhone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  openingEvidence: z.string().nullable().optional(),
  discoverySummary: z.string().nullable().optional(),
  whyThisLead: z.string().nullable().optional(),
  recommendedPitch: z.string().nullable().optional(),
  reject: z.boolean().optional(),
  rejectReason: z.string().nullable().optional(),
})

export type ExtractedSchool = z.infer<typeof extractionSchema>

function zodToLooseJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['schoolName'],
    properties: {
      schoolName: { type: 'string' },
      branchName: { type: ['string', 'null'] },
      schoolGroup: { type: ['string', 'null'] },
      area: { type: ['string', 'null'] },
      sector: { type: ['string', 'null'] },
      city: { type: ['string', 'null'] },
      state: { type: ['string', 'null'] },
      postalCode: { type: ['string', 'null'] },
      openingMonth: { type: ['integer', 'null'] },
      openingYear: { type: ['integer', 'null'] },
      academicSession: { type: ['string', 'null'] },
      schoolStatus: { type: ['string', 'null'], enum: [...SCHOOL_STATUSES, null] },
      contactPerson: { type: ['string', 'null'] },
      designation: { type: ['string', 'null'] },
      phone: { type: ['string', 'null'] },
      alternatePhone: { type: ['string', 'null'] },
      email: { type: ['string', 'null'] },
      website: { type: ['string', 'null'] },
      openingEvidence: { type: ['string', 'null'] },
      discoverySummary: { type: ['string', 'null'] },
      whyThisLead: { type: ['string', 'null'] },
      recommendedPitch: { type: ['string', 'null'] },
      reject: { type: 'boolean' },
      rejectReason: { type: ['string', 'null'] },
    },
  }
}

function rulesExtract(hits: SearchHit[], cityHint: string): ExtractedSchool | null {
  const joined = hits.map((h) => `${h.title} ${h.snippet}`).join(' \n ')
  if (EXCLUSION_PATTERNS.some((re) => re.test(joined))) {
    return {
      schoolName: hits[0]?.title?.slice(0, 80) || 'Unknown',
      reject: true,
      rejectReason: 'Looks like coaching/college/tuition, not a school campus target',
    }
  }
  const nameGuess =
    hits[0]?.title?.replace(/\s*[-|].*$/, '').replace(/\s*\(.*\)\s*$/, '').trim() || null
  if (!nameGuess || nameGuess.length < 4) return null

  const session = /2026\s*[-–]?\s*27|2026-27|session 2026/i.test(joined) ? '2026-27' : null
  const hiring = /hiring|recruit/i.test(joined)
  const admissions = /admission/i.test(joined)
  const campus = /new campus|new branch|inaugurat|launching|upcoming/i.test(joined)
  let schoolStatus: ExtractedSchool['schoolStatus'] = null
  if (hiring && campus) schoolStatus = 'HIRING_FOR_NEW_CAMPUS'
  else if (/new campus/i.test(joined)) schoolStatus = 'NEW_CAMPUS'
  else if (/new branch/i.test(joined)) schoolStatus = 'NEW_BRANCH'
  else if (admissions && campus) schoolStatus = 'ACTIVE_ADMISSIONS'
  else if (campus) schoolStatus = 'UPCOMING'
  else if (/new school/i.test(joined)) schoolStatus = 'NEW_SCHOOL'

  return {
    schoolName: nameGuess.slice(0, 160),
    city: cityHint,
    state: 'Haryana',
    academicSession: session,
    schoolStatus,
    openingYear: session ? 2026 : null,
    openingEvidence: hits[0]?.snippet?.slice(0, 280) || null,
    discoverySummary: hits[0]?.snippet?.slice(0, 400) || null,
    website: hits.find((h) => /\.edu\.in|school/i.test(h.url))?.url ?? null,
    whyThisLead: campus
      ? 'Public signals suggest a new or expanding campus in the target geography.'
      : 'Possible new-school signal — needs verification.',
    recommendedPitch: defaultPitch(schoolStatus, session),
    reject: false,
  }
}

export async function extractSchoolFromHits(
  hits: SearchHit[],
  cityHint: string,
): Promise<ExtractedSchool | null> {
  if (hits.length === 0) return null
  const fallback = rulesExtract(hits, cityHint)
  if (!assistantConfigured()) return fallback

  try {
    const model = assistantModel()
    const result = await model.turn({
      system: `You extract school campus discovery facts for MyCampusView sales CRM in India.
Only use the search snippets provided. Never invent phones, emails, names or opening dates.
If opening date is unknown, leave null and put evidence text in openingEvidence.
Reject coaching institutes, tuition centres, colleges and universities (reject=true).
Call emit_school_discovery exactly once.`,
      turns: [
        {
          role: 'user',
          text: JSON.stringify({ cityHint, hits: hits.slice(0, 6) }),
        },
      ],
      tools: [
        {
          name: 'emit_school_discovery',
          description: 'Structured school discovery extraction.',
          parameters: zodToLooseJsonSchema(),
        },
      ],
      onText: () => {},
    })
    if (result.refused) return fallback
    const call = result.toolCalls.find((c) => c.name === 'emit_school_discovery')
    if (!call) return fallback
    const parsed = extractionSchema.parse(JSON.parse(call.argumentsJson))
    if (!parsed.city) parsed.city = cityHint
    if (!parsed.recommendedPitch) {
      parsed.recommendedPitch = defaultPitch(parsed.schoolStatus, parsed.academicSession)
    }
    return parsed
  } catch {
    return fallback
  }
}

export type ScoredDiscovery = {
  verificationStatus: 'VERIFIED' | 'STRONG_LEAD' | 'NEEDS_VERIFICATION' | 'REJECTED'
  confidenceScore: number
  salesPriority: 'HOT' | 'HIGH' | 'MEDIUM' | 'LOW'
  opportunityScore: number
  evidenceScore: number
}

export function scoreDiscovery(
  extracted: ExtractedSchool,
  hits: ReturnType<typeof annotateHit>[],
): ScoredDiscovery {
  if (extracted.reject) {
    return {
      verificationStatus: 'REJECTED',
      confidenceScore: 0,
      salesPriority: 'LOW',
      opportunityScore: 0,
      evidenceScore: 0,
    }
  }

  const evidenceScore = hits.reduce((s, h) => s + h.weight, 0)
  const authoritative = hits.some((h) =>
    ['OFFICIAL_WEBSITE', 'SCHOOL_GROUP', 'REGULATORY'].includes(h.sourceType),
  )
  const newsOrAdmissions = hits.some((h) =>
    ['NEWS', 'ADMISSIONS', 'RECRUITMENT'].includes(h.sourceType),
  )

  let confidence = Math.min(100, evidenceScore)
  let opportunity = 0
  const status = extracted.schoolStatus

  if (status === 'NEW_SCHOOL' || status === 'NEW_CAMPUS') opportunity += 25
  if (status === 'NEW_BRANCH') opportunity += 25
  if (status === 'ACTIVE_ADMISSIONS') opportunity += 15
  if (status === 'HIRING_FOR_NEW_CAMPUS') opportunity += 10
  if (status === 'EXPANSION' || status === 'NEW_WING') opportunity += 10

  const postMarch =
    (extracted.openingYear && extracted.openingYear >= 2026) ||
    !!extracted.academicSession?.includes('2026') ||
    (extracted.openingYear === 2026 && (extracted.openingMonth ?? 4) > 3)
  if (postMarch) {
    confidence += 10
    opportunity += 30
  }
  if (status === 'NEW_CAMPUS' || status === 'NEW_BRANCH') confidence += 10
  if (status === 'ACTIVE_ADMISSIONS') opportunity += 20
  if (status === 'HIRING_FOR_NEW_CAMPUS') opportunity += 15
  if (extracted.phone || extracted.email) {
    confidence += 5
    opportunity += 10
  }
  // Unknown ERP is a sales opportunity for new campuses
  if (status === 'NEW_SCHOOL' || status === 'NEW_CAMPUS' || status === 'NEW_BRANCH') {
    opportunity += 10
  }

  // Deprioritize "old school annual admissions" with no new-campus signal
  const onlyAdmissions =
    /admission/i.test(extracted.openingEvidence ?? '') &&
    !status &&
    !postMarch
  if (onlyAdmissions) {
    confidence = Math.min(confidence, 35)
    opportunity = Math.min(opportunity, 30)
  }

  confidence = Math.max(0, Math.min(100, confidence))
  opportunity = Math.max(0, Math.min(100, opportunity))

  let verificationStatus: ScoredDiscovery['verificationStatus'] = 'NEEDS_VERIFICATION'
  if (authoritative && confidence >= 55) verificationStatus = 'VERIFIED'
  else if ((authoritative || newsOrAdmissions) && confidence >= 40) verificationStatus = 'STRONG_LEAD'
  else if (confidence < 25) verificationStatus = 'NEEDS_VERIFICATION'

  let salesPriority: ScoredDiscovery['salesPriority'] = 'MEDIUM'
  if (opportunity >= 80 && (extracted.phone || extracted.email) && postMarch) salesPriority = 'HOT'
  else if (opportunity >= 65) salesPriority = 'HIGH'
  else if (opportunity >= 45) salesPriority = 'MEDIUM'
  else salesPriority = 'LOW'

  return {
    verificationStatus,
    confidenceScore: confidence,
    salesPriority,
    opportunityScore: opportunity,
    evidenceScore,
  }
}

export function candidateKey(extracted: ExtractedSchool): string {
  return normalizeSchoolKey({
    schoolName: extracted.schoolName,
    branchName: extracted.branchName,
    sector: extracted.sector,
    area: extracted.area,
    city: extracted.city,
  })
}

// silence unused cutoff for now but keep import meaningful for future date math
void DISCOVERY_PRIORITY_CUTOFF
