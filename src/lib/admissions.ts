export const LEAD_STAGES = [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'CAMPUS_VISIT',
  'APPLICATION',
  'DOCUMENT_VERIFICATION',
  'APPROVED',
  'ENROLLED',
  'LOST',
] as const

export type LeadStage = (typeof LEAD_STAGES)[number]

export const LEAD_SOURCES = ['WALK_IN', 'REFERRAL', 'WEBSITE', 'CALL', 'ADS', 'OTHER'] as const

export const FOLLOW_UP_CHANNELS = ['CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'VISIT'] as const

export const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  CAMPUS_VISIT: 'Campus visit',
  APPLICATION: 'Application',
  DOCUMENT_VERIFICATION: 'Documents',
  APPROVED: 'Approved',
  ENROLLED: 'Enrolled',
  LOST: 'Lost',
}

export const OPEN_STAGES = LEAD_STAGES.filter((s) => s !== 'ENROLLED' && s !== 'LOST')
