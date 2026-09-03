export const CRM_STAGES = [
  'PROSPECT',
  'CONTACTED',
  'MEETING_SCHEDULED',
  'DEMO_COMPLETED',
  'FOLLOW_UP',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'PILOT',
  'WON',
  'LOST',
  'ON_HOLD',
  'NOT_INTERESTED',
] as const

export type CrmStage = (typeof CRM_STAGES)[number]

export const OPEN_CRM_STAGES = CRM_STAGES.filter(
  (s) => s !== 'WON' && s !== 'LOST' && s !== 'NOT_INTERESTED',
)

export const PIPELINE_COLUMNS = CRM_STAGES.filter((s) => s !== 'ON_HOLD' && s !== 'NOT_INTERESTED')

export const STAGE_LABELS: Record<CrmStage, string> = {
  PROSPECT: 'New lead',
  CONTACTED: 'Contacted',
  MEETING_SCHEDULED: 'Meeting scheduled',
  DEMO_COMPLETED: 'Demo completed',
  FOLLOW_UP: 'Follow-up',
  PROPOSAL_SENT: 'Proposal sent',
  NEGOTIATION: 'Negotiation',
  PILOT: 'Pilot',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On hold',
  NOT_INTERESTED: 'Not interested',
}

export const STAGE_PROBABILITY: Record<CrmStage, number> = {
  PROSPECT: 10,
  CONTACTED: 20,
  MEETING_SCHEDULED: 30,
  DEMO_COMPLETED: 45,
  FOLLOW_UP: 40,
  PROPOSAL_SENT: 55,
  NEGOTIATION: 70,
  PILOT: 80,
  WON: 100,
  LOST: 0,
  ON_HOLD: 15,
  NOT_INTERESTED: 0,
}

export const SCHOOL_TYPES = [
  'PRESCHOOL',
  'K12',
  'INTERNATIONAL',
  'COLLEGE',
  'UNIVERSITY',
  'COACHING',
  'OTHER',
] as const

export const SCHOOL_TYPE_LABELS: Record<(typeof SCHOOL_TYPES)[number], string> = {
  PRESCHOOL: 'Preschool',
  K12: 'K-12',
  INTERNATIONAL: 'International',
  COLLEGE: 'College',
  UNIVERSITY: 'University',
  COACHING: 'Coaching institute',
  OTHER: 'Other',
}

export const BOARDS = ['CBSE', 'ICSE', 'IB', 'CAMBRIDGE', 'STATE', 'OTHER'] as const

export const BOARD_LABELS: Record<(typeof BOARDS)[number], string> = {
  CBSE: 'CBSE',
  ICSE: 'ICSE',
  IB: 'IB',
  CAMBRIDGE: 'Cambridge',
  STATE: 'State Board',
  OTHER: 'Other',
}

export const LEAD_SOURCES = [
  'GOOGLE_ADS',
  'FACEBOOK',
  'INSTAGRAM',
  'LINKEDIN',
  'WEBSITE',
  'WHATSAPP',
  'REFERRAL',
  'CUSTOMER_REFERRAL',
  'EVENT',
  'SEMINAR',
  'COLD_CALL',
  'SCHOOL_VISIT',
  'PARTNER',
  'OTHER',
] as const

export const LEAD_SOURCE_LABELS: Record<(typeof LEAD_SOURCES)[number], string> = {
  GOOGLE_ADS: 'Google Ads',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  WEBSITE: 'Website',
  WHATSAPP: 'WhatsApp',
  REFERRAL: 'Referral',
  CUSTOMER_REFERRAL: 'Existing customer referral',
  EVENT: 'Event',
  SEMINAR: 'Seminar',
  COLD_CALL: 'Cold call',
  SCHOOL_VISIT: 'School visit',
  PARTNER: 'Partner',
  OTHER: 'Other',
}

export const CONTACT_ROLES = [
  'CHAIRMAN',
  'OWNER',
  'DIRECTOR',
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'ADMINISTRATOR',
  'ADMISSION_HEAD',
  'IT_HEAD',
  'ACCOUNTS_HEAD',
  'TRUSTEE',
  'OTHER',
] as const

export const CONTACT_ROLE_LABELS: Record<(typeof CONTACT_ROLES)[number], string> = {
  CHAIRMAN: 'Chairman',
  OWNER: 'Owner',
  DIRECTOR: 'Director',
  PRINCIPAL: 'Principal',
  VICE_PRINCIPAL: 'Vice Principal',
  ADMINISTRATOR: 'Administrator',
  ADMISSION_HEAD: 'Admission Head',
  IT_HEAD: 'IT Head',
  ACCOUNTS_HEAD: 'Accounts Head',
  TRUSTEE: 'Trustee',
  OTHER: 'Other',
}

export const ACTIVITY_TYPES = [
  'CALL',
  'INCOMING_CALL',
  'OUTGOING_CALL',
  'WHATSAPP',
  'SMS',
  'EMAIL',
  'VISIT',
  'ONLINE_MEETING',
  'DEMO',
  'NOTE',
  'FOLLOW_UP',
  'PROPOSAL',
  'DOCUMENT',
  'STAGE_CHANGE',
  'OWNER_CHANGE',
  'TASK',
] as const

export type CrmActivityType = (typeof ACTIVITY_TYPES)[number]

export const ACTIVITY_TYPE_LABELS: Record<CrmActivityType, string> = {
  CALL: 'Call',
  INCOMING_CALL: 'Incoming call',
  OUTGOING_CALL: 'Outgoing call',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
  VISIT: 'School visit',
  ONLINE_MEETING: 'Online meeting',
  DEMO: 'Demo',
  NOTE: 'Note',
  FOLLOW_UP: 'Follow-up',
  PROPOSAL: 'Proposal',
  DOCUMENT: 'Document shared',
  STAGE_CHANGE: 'Stage change',
  OWNER_CHANGE: 'Owner change',
  TASK: 'Task',
}

export const FOLLOW_UP_TYPES = [
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'VISIT',
  'DEMO',
  'MEETING',
  'PROPOSAL',
  'OTHER',
] as const

export const FOLLOW_UP_TYPE_LABELS: Record<(typeof FOLLOW_UP_TYPES)[number], string> = {
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  VISIT: 'Visit',
  DEMO: 'Demo',
  MEETING: 'Meeting',
  PROPOSAL: 'Proposal follow-up',
  OTHER: 'Other',
}

export const LOST_REASONS = [
  'PRICE',
  'COMPETITOR',
  'NO_BUDGET',
  'EXISTING_CONTRACT',
  'NO_DECISION',
  'PRODUCT_GAP',
  'ADOPTION',
  'TIMING',
  'NOT_RESPONSIVE',
  'OTHER',
] as const

export const LOST_REASON_LABELS: Record<(typeof LOST_REASONS)[number], string> = {
  PRICE: 'Price',
  COMPETITOR: 'Competitor selected',
  NO_BUDGET: 'No budget',
  EXISTING_CONTRACT: 'Existing contract',
  NO_DECISION: 'No decision',
  PRODUCT_GAP: 'Product gap',
  ADOPTION: 'Adoption concern',
  TIMING: 'Timing',
  NOT_RESPONSIVE: 'Not responsive',
  OTHER: 'Other',
}

export const TEMPERATURES = ['COLD', 'WARM', 'HOT'] as const
export type CrmTemperature = (typeof TEMPERATURES)[number]

export const STALE_DAYS = 7
export const HOT_STAGES: CrmStage[] = ['DEMO_COMPLETED', 'PROPOSAL_SENT', 'NEGOTIATION', 'PILOT']
export const WARM_STAGES: CrmStage[] = ['CONTACTED', 'MEETING_SCHEDULED', 'FOLLOW_UP']

export function weightedPipelineMinor(dealValueMinor: number, probability: number): number {
  return Math.round((dealValueMinor * clampProbability(probability)) / 100)
}

export function clampProbability(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function isFollowUpOverdue(dueAt: Date, status: string, now = new Date()): boolean {
  return status === 'PENDING' && dueAt.getTime() < now.getTime()
}

export function followUpDisplayStatus(dueAt: Date, status: string, now = new Date()): string {
  if (status === 'PENDING' && isFollowUpOverdue(dueAt, status, now)) return 'OVERDUE'
  return status
}

export function daysBetween(from: Date, to = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

export function hasNextAction(input: {
  stage: CrmStage
  nextFollowUpAt: Date | null
  now?: Date
}): boolean {
  if (!OPEN_CRM_STAGES.includes(input.stage as (typeof OPEN_CRM_STAGES)[number])) return true
  if (!input.nextFollowUpAt) return false
  return input.nextFollowUpAt.getTime() >= (input.now ?? new Date()).getTime()
}

export function computeTemperature(input: {
  stage: CrmStage
  lastActivityAt: Date | null
  temperatureManual?: boolean
  temperature?: CrmTemperature
  now?: Date
}): { temperature: CrmTemperature; reasons: string[] } {
  if (input.temperatureManual && input.temperature) {
    return { temperature: input.temperature, reasons: ['Set manually'] }
  }

  const now = input.now ?? new Date()
  const reasons: string[] = []
  let temperature: CrmTemperature = 'COLD'

  if (HOT_STAGES.includes(input.stage)) {
    temperature = 'HOT'
    reasons.push(`Stage is ${STAGE_LABELS[input.stage]}`)
  } else if (WARM_STAGES.includes(input.stage)) {
    temperature = 'WARM'
    reasons.push(`Stage is ${STAGE_LABELS[input.stage]}`)
  } else {
    reasons.push('Early or closed stage')
  }

  if (input.lastActivityAt && daysBetween(input.lastActivityAt, now) >= STALE_DAYS && input.stage !== 'WON') {
    temperature = 'COLD'
    reasons.push(`No interaction for ${daysBetween(input.lastActivityAt, now)} days`)
  }

  return { temperature, reasons }
}

export function websiteDomain(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const withScheme = raw.includes('://') ? raw : `https://${raw}`
    const host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, '')
    return host || null
  } catch {
    return raw.trim().toLowerCase().replace(/^www\./, '') || null
  }
}

export function rupeesToMinor(value: string | number | undefined): number {
  if (value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[, ]/g, ''))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

export function minorToRupeesInput(minor: number): string {
  if (!minor) return ''
  return String(minor / 100)
}

export const MEETING_TYPES = [
  'First meeting',
  'Discovery',
  'Demo',
  'Follow-up',
  'Proposal discussion',
  'Negotiation',
  'Pilot discussion',
  'Closure',
] as const

export const MEETING_MODES = ['PHYSICAL', 'ONLINE'] as const
export const MEETING_MODE_LABELS: Record<(typeof MEETING_MODES)[number], string> = {
  PHYSICAL: 'In person',
  ONLINE: 'Online',
}

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const
export const TASK_STATUS_LABELS: Record<(typeof TASK_STATUSES)[number], string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const OPEN_TASK_STATUSES = ['TODO', 'IN_PROGRESS'] as const

export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

export function dayKeyKolkata(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** True when a meeting starts within the next 35 minutes (cron-safe window). */
export function isMeetingImminent(startsAt: Date, now = new Date(), windowMs = 35 * 60_000): boolean {
  const delta = startsAt.getTime() - now.getTime()
  return delta > 0 && delta <= windowMs
}

/** True when a follow-up is due within the next hour. */
export function isFollowUpSoon(dueAt: Date, now = new Date(), windowMs = 60 * 60_000): boolean {
  const delta = dueAt.getTime() - now.getTime()
  return delta > 0 && delta <= windowMs
}

export const CRM_SORT_FIELDS = [
  'name',
  'city',
  'stage',
  'temperature',
  'lastActivityAt',
  'nextFollowUpAt',
  'dealValueMinor',
  'createdAt',
  'updatedAt',
] as const

export const CRM_CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL'] as const
export type CrmMessageChannel = (typeof CRM_CHANNELS)[number]

export const CRM_CHANNEL_LABELS: Record<CrmMessageChannel, string> = {
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
}

export const CRM_TEMPLATE_CATEGORIES = [
  'First contact',
  'Meeting confirmation',
  'Demo confirmation',
  'Demo reminder',
  'Post-demo follow-up',
  'Proposal shared',
  'Proposal follow-up',
  'Meeting thank-you',
  'Re-engagement',
  'Pilot',
  'Closure',
  'Lost opportunity',
] as const

export const CRM_TEMPLATE_VARS = [
  'contactName',
  'schoolName',
  'meetingDate',
  'meetingTime',
  'ownerName',
  'proposalLink',
] as const

export const CRM_TEMPLATE_VAR_HINT =
  '{{contactName}}, {{schoolName}}, {{meetingDate}}, {{meetingTime}}, {{ownerName}}, {{proposalLink}}'

export type DefaultCrmTemplate = {
  name: string
  category: (typeof CRM_TEMPLATE_CATEGORIES)[number]
  channel: CrmMessageChannel
  subject?: string
  body: string
}

export const DEFAULT_CRM_TEMPLATES: DefaultCrmTemplate[] = [
  {
    name: 'First contact',
    category: 'First contact',
    channel: 'WHATSAPP',
    body: 'Hello {{contactName}}, this is {{ownerName}} from MyCampusView. We help schools like {{schoolName}} run fees, attendance and parent communication in one place. Would you have 15 minutes this week for a quick intro?',
  },
  {
    name: 'First contact SMS',
    category: 'First contact',
    channel: 'SMS',
    body: 'Hi {{contactName}}, {{ownerName}} from MyCampusView. We help {{schoolName}} with fees, attendance and parent comms. Free for a short call this week?',
  },
  {
    name: 'Meeting confirmation',
    category: 'Meeting confirmation',
    channel: 'WHATSAPP',
    body: 'Hi {{contactName}}, confirming our meeting with {{schoolName}} on {{meetingDate}} at {{meetingTime}}. Looking forward to it. — {{ownerName}}, MyCampusView',
  },
  {
    name: 'Meeting confirmation email',
    category: 'Meeting confirmation',
    channel: 'EMAIL',
    subject: 'Meeting confirmed · {{schoolName}} · {{meetingDate}}',
    body: 'Hello {{contactName}},\n\nConfirming our meeting on {{meetingDate}} at {{meetingTime}}.\n\nI will come prepared with a short walkthrough of how MyCampusView can support {{schoolName}}.\n\nRegards,\n{{ownerName}}\nMyCampusView',
  },
  {
    name: 'Demo confirmation',
    category: 'Demo confirmation',
    channel: 'WHATSAPP',
    body: 'Hi {{contactName}}, the MyCampusView demo for {{schoolName}} is confirmed for {{meetingDate}} at {{meetingTime}}. I will share a walkthrough of fees, attendance and parent communication. — {{ownerName}}',
  },
  {
    name: 'Demo reminder',
    category: 'Demo reminder',
    channel: 'WHATSAPP',
    body: 'Reminder: MyCampusView demo for {{schoolName}} is today at {{meetingTime}}. See you then, {{contactName}}. — {{ownerName}}',
  },
  {
    name: 'Demo reminder SMS',
    category: 'Demo reminder',
    channel: 'SMS',
    body: 'Reminder: MyCampusView demo for {{schoolName}} today at {{meetingTime}}. — {{ownerName}}',
  },
  {
    name: 'Post-demo follow-up',
    category: 'Post-demo follow-up',
    channel: 'WHATSAPP',
    body: 'Thank you {{contactName}} for the demo time today. Happy to send a proposal or answer anything {{schoolName}} wants to compare. When works for a short follow-up? — {{ownerName}}',
  },
  {
    name: 'Proposal shared',
    category: 'Proposal shared',
    channel: 'WHATSAPP',
    body: 'Hi {{contactName}}, sharing the MyCampusView proposal for {{schoolName}}: {{proposalLink}}\nHappy to walk through commercials whenever you are free. — {{ownerName}}',
  },
  {
    name: 'Proposal shared email',
    category: 'Proposal shared',
    channel: 'EMAIL',
    subject: 'MyCampusView proposal · {{schoolName}}',
    body: 'Hello {{contactName}},\n\nPlease find the proposal for {{schoolName}} here:\n{{proposalLink}}\n\nI am happy to walk through commercials or implementation whenever it suits you.\n\nRegards,\n{{ownerName}}\nMyCampusView',
  },
  {
    name: 'Proposal follow-up',
    category: 'Proposal follow-up',
    channel: 'WHATSAPP',
    body: 'Hi {{contactName}}, checking in on the MyCampusView proposal for {{schoolName}}. Any questions I can close this week? — {{ownerName}}',
  },
  {
    name: 'Meeting thank-you',
    category: 'Meeting thank-you',
    channel: 'WHATSAPP',
    body: 'Thank you {{contactName}} for the time today with {{schoolName}}. I will send the next step we discussed. — {{ownerName}}, MyCampusView',
  },
  {
    name: 'Meeting thank-you email',
    category: 'Meeting thank-you',
    channel: 'EMAIL',
    subject: 'Thank you · {{schoolName}}',
    body: 'Hello {{contactName}},\n\nThank you for the conversation today. Next I will send what we agreed for {{schoolName}}.\n\nRegards,\n{{ownerName}}\nMyCampusView',
  },
  {
    name: 'Re-engagement',
    category: 'Re-engagement',
    channel: 'WHATSAPP',
    body: 'Hi {{contactName}}, circling back on MyCampusView for {{schoolName}}. If timing is better now, I can share a short recap or a fresh demo slot. — {{ownerName}}',
  },
  {
    name: 'Pilot',
    category: 'Pilot',
    channel: 'WHATSAPP',
    body: 'Hi {{contactName}}, we can start a short MyCampusView pilot for {{schoolName}} so the team can try fees and parent communication on live data. Shall I send the pilot plan? — {{ownerName}}',
  },
  {
    name: 'Closure',
    category: 'Closure',
    channel: 'WHATSAPP',
    body: 'Hi {{contactName}}, ready to lock MyCampusView for {{schoolName}} whenever you are. I can send the agreement and onboarding dates as soon as you confirm. — {{ownerName}}',
  },
  {
    name: 'Lost opportunity',
    category: 'Lost opportunity',
    channel: 'WHATSAPP',
    body: 'Hi {{contactName}}, thank you for considering MyCampusView for {{schoolName}}. If the situation changes later this year I would be glad to reconnect. Wishing the team well. — {{ownerName}}',
  },
]

export function formatCrmMeetingSlots(
  startsAt: Date | null | undefined,
  timeZone = 'Asia/Kolkata',
): { meetingDate: string; meetingTime: string } {
  if (!startsAt) return { meetingDate: '', meetingTime: '' }
  return {
    meetingDate: startsAt.toLocaleDateString('en-IN', {
      timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    meetingTime: startsAt.toLocaleTimeString('en-IN', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    }),
  }
}

export function crmMessageVars(input: {
  contactName?: string | null
  schoolName?: string | null
  meetingDate?: string | null
  meetingTime?: string | null
  ownerName?: string | null
  proposalLink?: string | null
}): Record<string, string> {
  return {
    contactName: input.contactName?.trim() || '',
    schoolName: input.schoolName?.trim() || '',
    meetingDate: input.meetingDate?.trim() || '',
    meetingTime: input.meetingTime?.trim() || '',
    ownerName: input.ownerName?.trim() || '',
    proposalLink: input.proposalLink?.trim() || '',
  }
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const t = value?.trim()
    if (t) return t
  }
  return null
}

export function pickCrmDestination(
  channel: CrmMessageChannel,
  input: {
    contactWhatsapp?: string | null
    contactMobile?: string | null
    contactEmail?: string | null
    schoolPhone?: string | null
    schoolEmail?: string | null
  },
): string | null {
  if (channel === 'EMAIL') return firstNonEmpty(input.contactEmail, input.schoolEmail)
  if (channel === 'WHATSAPP') {
    return firstNonEmpty(input.contactWhatsapp, input.contactMobile, input.schoolPhone)
  }
  return firstNonEmpty(input.contactMobile, input.schoolPhone)
}

/** Snapshot used by Growth CRM intelligence (rules + optional AI). */
export type CrmIntelFacts = {
  schoolName: string
  stage: CrmStage
  temperature: CrmTemperature
  ownerName: string | null
  lastActivityAt: Date | null
  stageChangedAt: Date
  nextFollowUpAt: Date | null
  nextAction: string | null
  currentErp: string | null
  competitor: string | null
  primaryObjection: string | null
  dealValueMinor: number
  probability: number
  decisionMakerName: string | null
  primaryContactName: string | null
  overdueFollowUpCount: number
  openTaskCount: number
  upcomingMeetingAt: Date | null
  upcomingMeetingType: string | null
  lastVisitAt: Date | null
  notes: string | null
  recentActivities: { type: string; summary: string; createdAt: Date }[]
}

export type CrmRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export type CrmRiskItem = {
  code: string
  label: string
  severity: CrmRiskLevel
}

export type CrmRiskAssessment = {
  level: CrmRiskLevel
  score: number
  risks: CrmRiskItem[]
}

export type CrmNextActionSuggestion = {
  channel: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'VISIT' | 'MEETING'
  followUpWithinDays: number
  priority: 'low' | 'medium' | 'high'
  talkingPoints: string[]
  rationale: string
  objective: string
}

export type CrmMeetingBrief = {
  facts: string[]
  recommendations: string[]
  objective: string
  risks: string[]
}

export type CrmConversationSummary = {
  summary: string
  highlights: string[]
}

const STAGE_DAYS_WARN: Partial<Record<CrmStage, number>> = {
  CONTACTED: 14,
  MEETING_SCHEDULED: 10,
  DEMO_COMPLETED: 10,
  FOLLOW_UP: 14,
  PROPOSAL_SENT: 14,
  NEGOTIATION: 21,
  PILOT: 30,
}

function severityScore(level: CrmRiskLevel): number {
  return level === 'HIGH' ? 3 : level === 'MEDIUM' ? 2 : 1
}

export function assessCrmRisk(facts: CrmIntelFacts, now = new Date()): CrmRiskAssessment {
  const risks: CrmRiskItem[] = []
  const live = OPEN_CRM_STAGES.includes(facts.stage as (typeof OPEN_CRM_STAGES)[number])

  if (live && !facts.ownerName) {
    risks.push({ code: 'NO_OWNER', label: 'No owner assigned', severity: 'HIGH' })
  }
  if (live && !hasNextAction({ stage: facts.stage, nextFollowUpAt: facts.nextFollowUpAt, now })) {
    risks.push({ code: 'NO_NEXT_ACTION', label: 'No future follow-up booked', severity: 'HIGH' })
  }
  if (facts.overdueFollowUpCount > 0) {
    risks.push({
      code: 'OVERDUE_FOLLOW_UP',
      label: `${facts.overdueFollowUpCount} overdue follow-up${facts.overdueFollowUpCount === 1 ? '' : 's'}`,
      severity: 'HIGH',
    })
  }
  if (facts.lastActivityAt && daysBetween(facts.lastActivityAt, now) >= STALE_DAYS && live) {
    risks.push({
      code: 'STALE',
      label: `No interaction for ${daysBetween(facts.lastActivityAt, now)} days`,
      severity: 'HIGH',
    })
  }
  const stageDays = daysBetween(facts.stageChangedAt, now)
  const warnAfter = STAGE_DAYS_WARN[facts.stage]
  if (live && warnAfter && stageDays >= warnAfter) {
    risks.push({
      code: 'LONG_IN_STAGE',
      label: `${STAGE_LABELS[facts.stage]} for ${stageDays} days`,
      severity: stageDays >= warnAfter * 1.5 ? 'HIGH' : 'MEDIUM',
    })
  }
  if (live && !facts.decisionMakerName) {
    risks.push({
      code: 'NO_DECISION_MAKER',
      label: 'No decision-maker contact marked',
      severity: 'MEDIUM',
    })
  }
  if (facts.primaryObjection) {
    risks.push({
      code: 'OBJECTION',
      label: `Open objection: ${facts.primaryObjection}`,
      severity: 'MEDIUM',
    })
  }
  if (facts.competitor) {
    risks.push({
      code: 'COMPETITOR',
      label: `Competitor in play: ${facts.competitor}`,
      severity: 'MEDIUM',
    })
  }
  if (HOT_STAGES.includes(facts.stage) && facts.temperature === 'COLD') {
    risks.push({
      code: 'HOT_STAGE_COLD',
      label: 'Late-stage opportunity has gone cold',
      severity: 'HIGH',
    })
  }
  if (facts.upcomingMeetingAt && !facts.nextAction) {
    risks.push({
      code: 'MEETING_NO_OBJECTIVE',
      label: 'Meeting scheduled without a written next action',
      severity: 'LOW',
    })
  }

  const score = risks.reduce((s, r) => s + severityScore(r.severity), 0)
  const level: CrmRiskLevel =
    risks.some((r) => r.severity === 'HIGH') || score >= 6
      ? 'HIGH'
      : risks.length > 0 || score >= 2
        ? 'MEDIUM'
        : 'LOW'

  return { level, score, risks }
}

export function recommendCrmNextAction(facts: CrmIntelFacts, now = new Date()): CrmNextActionSuggestion {
  const risk = assessCrmRisk(facts, now)
  const overdue = facts.overdueFollowUpCount > 0
  const idle = facts.lastActivityAt ? daysBetween(facts.lastActivityAt, now) : 99

  if (overdue) {
    return {
      channel: 'CALL',
      followUpWithinDays: 0,
      priority: 'high',
      objective: 'Clear overdue follow-up today',
      talkingPoints: [
        facts.primaryContactName ? `Call ${facts.primaryContactName}` : 'Call the primary contact',
        facts.nextAction ? `Confirm: ${facts.nextAction}` : 'Agree a concrete next step and date',
        'Log the outcome before leaving the call',
      ],
      rationale: `${facts.overdueFollowUpCount} follow-up(s) overdue — contact today.`,
    }
  }

  if (facts.upcomingMeetingAt) {
    const slots = formatCrmMeetingSlots(facts.upcomingMeetingAt)
    return {
      channel: 'MEETING',
      followUpWithinDays: 0,
      priority: risk.level === 'HIGH' ? 'high' : 'medium',
      objective: `Prepare for ${facts.upcomingMeetingType ?? 'meeting'} on ${slots.meetingDate}`,
      talkingPoints: [
        'Review last visit notes and open objections',
        facts.decisionMakerName
          ? `Confirm ${facts.decisionMakerName} will attend`
          : 'Confirm who from the school will attend',
        'Decide the single ask for this meeting',
      ],
      rationale: `Upcoming ${facts.upcomingMeetingType ?? 'meeting'} on ${slots.meetingDate} at ${slots.meetingTime}.`,
    }
  }

  if (!hasNextAction({ stage: facts.stage, nextFollowUpAt: facts.nextFollowUpAt, now })) {
    return {
      channel: 'CALL',
      followUpWithinDays: 0,
      priority: 'high',
      objective: 'Book the next follow-up',
      talkingPoints: [
        'Pick a channel and due date before ending the touch',
        facts.primaryObjection ? `Address: ${facts.primaryObjection}` : 'Ask what is blocking a decision',
      ],
      rationale: 'Live opportunity has no future follow-up.',
    }
  }

  const byStage: Partial<
    Record<CrmStage, Omit<CrmNextActionSuggestion, 'priority' | 'rationale'>>
  > = {
    PROSPECT: {
      channel: 'CALL',
      followUpWithinDays: 0,
      objective: 'First discovery call',
      talkingPoints: ['Confirm decision maker', 'Ask about current ERP and renewal', 'Book a visit or demo'],
    },
    CONTACTED: {
      channel: 'WHATSAPP',
      followUpWithinDays: 2,
      objective: 'Secure a discovery meeting',
      talkingPoints: ['Share a short product overview', 'Offer two meeting slots'],
    },
    MEETING_SCHEDULED: {
      channel: 'WHATSAPP',
      followUpWithinDays: 1,
      objective: 'Confirm attendance and agenda',
      talkingPoints: ['Send meeting confirmation', 'Ask who else should join'],
    },
    DEMO_COMPLETED: {
      channel: 'EMAIL',
      followUpWithinDays: 2,
      objective: 'Move to proposal',
      talkingPoints: ['Recap modules they liked', 'Ask for commercial timeline', 'Offer a written proposal'],
    },
    FOLLOW_UP: {
      channel: 'CALL',
      followUpWithinDays: 2,
      objective: 'Re-qualify interest',
      talkingPoints: ['Check if priorities changed', 'Offer a focused demo on one pain'],
    },
    PROPOSAL_SENT: {
      channel: 'CALL',
      followUpWithinDays: 3,
      objective: 'Close proposal questions',
      talkingPoints: [
        facts.primaryObjection ? `Handle objection: ${facts.primaryObjection}` : 'Ask what is left to decide',
        'Confirm decision date',
      ],
    },
    NEGOTIATION: {
      channel: 'CALL',
      followUpWithinDays: 2,
      objective: 'Unlock commercial agreement',
      talkingPoints: ['List open commercial points', 'Propose a clear close date'],
    },
    PILOT: {
      channel: 'MEETING',
      followUpWithinDays: 5,
      objective: 'Keep the pilot on track',
      talkingPoints: ['Check pilot usage', 'Schedule a mid-pilot review'],
    },
  }

  const hint = byStage[facts.stage] ?? {
    channel: 'CALL' as const,
    followUpWithinDays: 3,
    objective: 'Review the account and set a next step',
    talkingPoints: ['Review timeline and risks', 'Agree the next owner action'],
  }

  return {
    ...hint,
    priority: risk.level === 'HIGH' || idle >= STALE_DAYS ? 'high' : risk.level === 'MEDIUM' ? 'medium' : 'low',
    rationale:
      idle >= STALE_DAYS
        ? `Quiet for ${idle} days — re-engage before the deal cools further.`
        : `Standard next step for ${STAGE_LABELS[facts.stage]}.`,
  }
}

export function buildCrmMeetingBrief(facts: CrmIntelFacts, now = new Date()): CrmMeetingBrief {
  const risk = assessCrmRisk(facts, now)
  const next = recommendCrmNextAction(facts, now)
  const meeting = formatCrmMeetingSlots(facts.upcomingMeetingAt)
  const factsList = [
    `School: ${facts.schoolName}`,
    `Stage: ${STAGE_LABELS[facts.stage]} · ${facts.temperature.toLowerCase()}`,
    facts.ownerName ? `Owner: ${facts.ownerName}` : 'Owner: unassigned',
    facts.decisionMakerName
      ? `Decision maker: ${facts.decisionMakerName}`
      : facts.primaryContactName
        ? `Primary contact: ${facts.primaryContactName}`
        : 'Contacts: none marked',
    facts.currentErp ? `Current ERP: ${facts.currentErp}` : 'Current ERP: unknown',
    facts.competitor ? `Competitor: ${facts.competitor}` : null,
    facts.primaryObjection ? `Objection: ${facts.primaryObjection}` : null,
    facts.dealValueMinor
      ? `Deal: ₹${(facts.dealValueMinor / 100).toLocaleString('en-IN')} · ${facts.probability}%`
      : null,
    facts.lastVisitAt ? `Last visit: ${facts.lastVisitAt.toLocaleDateString('en-IN')}` : 'Last visit: none logged',
    facts.lastActivityAt
      ? `Last activity: ${daysBetween(facts.lastActivityAt, now)} day(s) ago`
      : 'Last activity: never',
    facts.nextFollowUpAt
      ? `Next follow-up: ${facts.nextFollowUpAt.toLocaleString('en-IN')}`
      : 'Next follow-up: none',
    facts.upcomingMeetingAt
      ? `Upcoming meeting: ${facts.upcomingMeetingType ?? 'Meeting'} · ${meeting.meetingDate} ${meeting.meetingTime}`
      : 'Upcoming meeting: none',
    facts.nextAction ? `Written next action: ${facts.nextAction}` : null,
  ].filter((line): line is string => Boolean(line))

  return {
    facts: factsList,
    recommendations: [
      `Objective: ${next.objective}`,
      ...next.talkingPoints.map((p) => `Talking point: ${p}`),
    ],
    objective: next.objective,
    risks: risk.risks.map((r) => r.label),
  }
}

export function summarizeCrmConversation(
  activities: { type: string; summary: string; createdAt: Date }[],
  limit = 12,
): CrmConversationSummary {
  const rows = activities.slice(0, limit)
  if (rows.length === 0) {
    return {
      summary: 'No conversation history logged yet.',
      highlights: ['Log the first call or visit to build a trail.'],
    }
  }
  const highlights = rows.slice(0, 5).map((a) => {
    const when = a.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    const label = ACTIVITY_TYPE_LABELS[a.type as CrmActivityType] ?? a.type
    return `${when} · ${label}: ${a.summary}`
  })
  const summary = `Last ${rows.length} logged touch(es), newest first. Focus on the latest ${Math.min(3, rows.length)} items before the next outreach.`
  return { summary, highlights }
}
