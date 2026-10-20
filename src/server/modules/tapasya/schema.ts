import { z } from 'zod'

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const scale = z.number().int().min(1).max(5)
const minutes = z.number().int().min(1).max(600)

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  subject: z.string().trim().max(60).nullish(),
  category: z.enum(['HOMEWORK', 'CHAPTER', 'REVISION', 'PERSONAL', 'TEACHER_GOAL', 'OTHER']).default('PERSONAL'),
  difficulty: scale.default(3),
  importance: scale.default(3),
  urgency: scale.default(3),
  estimatedMinutes: minutes.default(25),
  dueOn: ymd.nullish(),
  notes: z.string().trim().max(2000).nullish(),
})

export const taskUpdateSchema = taskInputSchema.partial().extend({
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  reflection: z.string().trim().max(2000).nullish(),
})

export const teacherTaskSchema = taskInputSchema.extend({
  studentIds: z.array(z.string().min(1)).min(1).max(200),
  teacherInstructions: z.string().trim().max(2000).nullish(),
  isMandatory: z.boolean().default(false),
  studentCanEdit: z.boolean().default(false),
  requiredFocusMinutes: minutes.nullish(),
  requiredBreakMinutes: z.number().int().min(1).max(60).nullish(),
  homeworkId: z.string().min(1).nullish(),
})

export const frogSchema = z.object({
  taskIds: z.array(z.string().min(1)).max(5),
  primaryTaskId: z.string().min(1).nullable(),
})

export const planQuerySchema = z.object({
  availableMinutes: z.coerce.number().int().min(15).max(720).default(120),
  focusMinutes: z.coerce.number().int().min(1).max(180).default(25),
  breakMinutes: z.coerce.number().int().min(0).max(60).default(5),
})

export const presetSchema = z.object({
  name: z.string().trim().min(1).max(40),
  focusMinutes: z.number().int(),
  shortBreakMinutes: z.number().int(),
  longBreakMinutes: z.number().int().nullable(),
  cyclesBeforeLongBreak: z.number().int(),
  autoStartBreak: z.boolean(),
  autoStartFocus: z.boolean(),
  allowPause: z.boolean(),
  allowSkipBreak: z.boolean(),
  soundEnabled: z.boolean(),
  hapticsEnabled: z.boolean(),
  isDefault: z.boolean().optional(),
})

export const restrictionReportSchema = z.object({
  level: z.enum(['TIMER_ONLY', 'PARTIAL', 'APP_SHIELDING', 'MANAGED_KIOSK']),
  detail: z.record(z.unknown()).optional(),
})

export const startSessionSchema = z.object({
  clientSessionKey: z.string().min(8).max(80),
  /** `builtin:CLASSIC` or a personal preset id. */
  presetRef: z.string().min(1).max(80),
  plannedCycles: z.number().int().min(1).max(24),
  taskId: z.string().min(1).nullish(),
  deviceId: z.string().max(120).nullish(),
  restriction: restrictionReportSchema.optional(),
  /** Set when the session began while offline; the start time is then the client's. */
  clientStartedAt: z.string().datetime().optional(),
})

export const sessionEventSchema = z.object({
  clientEventId: z.string().min(4).max(80),
  type: z.enum(['START_FOCUS', 'PAUSE', 'RESUME', 'START_BREAK', 'SKIP_BREAK', 'FINISH', 'CANCEL', 'INTERRUPT', 'SYNC']),
  clientAt: z.string().datetime().optional(),
  /** True when the event was queued offline: its clientAt is then used. */
  offline: z.boolean().optional(),
  restriction: restrictionReportSchema.optional(),
})

export const sessionEventsSchema = z.object({
  events: z.array(sessionEventSchema).min(1).max(100),
})

export const deviceReportSchema = z.object({
  installationId: z.string().min(8).max(120),
  platform: z.enum(['android', 'ios', 'web']),
  osVersion: z.string().max(40).nullish(),
  appVersion: z.string().max(40).nullish(),
  capabilityState: z.string().max(40),
  capabilities: z.record(z.unknown()),
  managed: z.boolean().default(false),
})

export const profileSchema = z.object({
  alias: z.string().trim().min(3).max(20),
  avatarKey: z.string().max(20),
  showBadges: z.boolean().default(true),
  division: z.string().max(30).nullish(),
})

export const unlockRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  action: z.enum(['OPEN_APPS', 'END_SESSION', 'BREAK_APPS']),
  reason: z.string().trim().min(3).max(300),
  requestedMinutes: z.number().int().min(1).max(120),
  sessionId: z.string().min(1).nullish(),
  deviceId: z.string().max(120).nullish(),
})

export const unlockCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') })

export const unlockDecisionSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT']), minutes: z.number().int().min(1).max(120).optional() })

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export const boardQuerySchema = pageSchema.extend({
  period: z.enum(['ALL_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'SEASON']).default('WEEKLY'),
  division: z.string().max(30).optional(),
})

export const guardianConsentSchema = z.object({
  studentId: z.string().min(1),
  decision: z.enum(['APPROVE', 'DECLINE', 'WITHDRAW']),
})

export const syncSessionSchema = z.object({
  start: startSessionSchema,
  events: z.array(sessionEventSchema).max(100).default([]),
})

const wholeNumber = z.number().int().min(0).max(100_000)

export const scoringRulesSchema = z.object({
  durationMode: z.enum(['FLAT', 'PER_MINUTE']),
  basePerInterval: wholeNumber,
  perMinute: wholeNumber,
  minEligibleFocusMinutes: wholeNumber,
  maxEligibleFocusMinutes: wholeNumber,
  minCompletionRatio: z.number().gt(0).max(1),
  maxPausesPerInterval: wholeNumber,
  frogBonus: wholeNumber,
  allCyclesBonus: wholeNumber,
  allCyclesMinCycles: wholeNumber,
  achievementXp: wholeNumber,
  dailyCap: wholeNumber,
  weeklyCap: wholeNumber,
  maxSessionsPerDay: wholeNumber,
  offlineMaxAgeHours: wholeNumber,
})

export const publishScoringSchema = z.object({
  rules: scoringRulesSchema,
  effectiveFrom: z.string().datetime(),
  reason: z.string().trim().min(10).max(500),
})

export const seasonSchema = z.object({
  name: z.string().trim().min(3).max(60),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
})

export const globalSettingsSchema = z.object({
  leaderboardEnabled: z.boolean(),
  previewEnabled: z.boolean(),
  timezone: z.string().min(3).max(60),
  limits: z.object({
    minFocusMinutes: z.number().int().min(1).max(600),
    maxFocusMinutes: z.number().int().min(1).max(600),
    minBreakMinutes: z.number().int().min(1).max(120),
    maxBreakMinutes: z.number().int().min(1).max(120),
    maxLongBreakMinutes: z.number().int().min(1).max(180),
    maxCyclesPerSession: z.number().int().min(1).max(24),
    maxPauseMinutes: z.number().int().min(1).max(240),
    idleExpiryMinutes: z.number().int().min(5).max(1440),
  }),
})

export const moderateSchema = z.object({ action: z.enum(['SUSPEND', 'RESTORE']), reason: z.string().trim().min(5).max(300) })

export const reverseXpSchema = z.object({ xpEventId: z.string().min(1), reason: z.string().trim().min(10).max(300) })

export const schoolPolicySchema = z.object({
  enabled: z.boolean(),
  globalLeaderboardAllowed: z.boolean(),
  schoolLeaderboardEnabled: z.boolean(),
  minFocusMinutes: z.number().int().min(1).max(600),
  maxFocusMinutes: z.number().int().min(1).max(600),
  minBreakMinutes: z.number().int().min(1).max(120),
  maxBreakMinutes: z.number().int().min(1).max(120),
  allowPause: z.boolean(),
  allowSkipBreak: z.boolean(),
  maxUnlockMinutes: z.number().int().min(1).max(120),
  maxUnlockRequestsPerDay: z.number().int().min(0).max(50),
})
