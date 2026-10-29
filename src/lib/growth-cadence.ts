import { STAGE_PROBABILITY, type CrmStage } from '@/lib/growth-crm'

export type StageCadence = { stage: CrmStage; days: number; followUpType: string; enabled: boolean }

/** Stages a lead can be "worked" in; each may book a follow-up on entry. */
export const CADENCE_STAGES: CrmStage[] = [
  'CONTACTED',
  'MEETING_SCHEDULED',
  'DEMO_COMPLETED',
  'FOLLOW_UP',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'PILOT',
]

/** Meeting scheduled is off by default: the meeting itself is the next step. */
export const DEFAULT_CADENCE: Record<string, Omit<StageCadence, 'stage'>> = {
  CONTACTED: { days: 2, followUpType: 'CALL', enabled: true },
  MEETING_SCHEDULED: { days: 1, followUpType: 'WHATSAPP', enabled: false },
  DEMO_COMPLETED: { days: 2, followUpType: 'CALL', enabled: true },
  FOLLOW_UP: { days: 3, followUpType: 'CALL', enabled: true },
  PROPOSAL_SENT: { days: 3, followUpType: 'PROPOSAL', enabled: true },
  NEGOTIATION: { days: 2, followUpType: 'CALL', enabled: true },
  PILOT: { days: 5, followUpType: 'VISIT', enabled: true },
}

export function resolveCadence(saved: { stage: string; days: number; followUpType: string; enabled: boolean }[]): StageCadence[] {
  return CADENCE_STAGES.map((stage) => {
    const row = saved.find((s) => s.stage === stage)
    return row ? { stage, days: row.days, followUpType: row.followUpType, enabled: row.enabled } : { stage, ...DEFAULT_CADENCE[stage]! }
  })
}

/** Leads untouched this long show up as "going cold". */
export const STALE_ALERT_DAYS = 14

/** Overdue by more than this many days → escalated (listed first, in red). */
export const ESCALATE_AFTER_DAYS = 2

/** Stages that must always have a next step booked (a raw prospect is exempt from the list). */
export const NEXT_STEP_STAGES: CrmStage[] = ['CONTACTED', 'MEETING_SCHEDULED', 'DEMO_COMPLETED', 'FOLLOW_UP', 'PROPOSAL_SENT', 'NEGOTIATION', 'PILOT']

/** Activity types that mean we actually spoke to or met the school. */
export const TOUCH_ACTIVITY_TYPES = ['CALL', 'INCOMING_CALL', 'OUTGOING_CALL', 'VISIT', 'ONLINE_MEETING', 'DEMO', 'WHATSAPP'] as const

/** A stage change towards a deal (by win probability), ignoring closed/lost outcomes other than WON. */
export function isForwardMove(from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from || !to || from === to) return false
  if (to === 'WON') return true
  const a = STAGE_PROBABILITY[from as CrmStage]
  const b = STAGE_PROBABILITY[to as CrmStage]
  if (a === undefined || b === undefined || b === 0) return false
  return b > a
}
