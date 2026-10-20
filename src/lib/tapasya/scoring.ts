/**
 * Shared XP scoring rules.
 *
 * One rule set applies to every student on the global board for a given
 * period; only the platform administrator can publish a new version, and a new
 * version applies from its effective date forward.
 *
 * The default is FLAT: every eligible completed focus interval earns the same
 * base XP whether it was 25 or 45 minutes, so choosing the longest permitted
 * duration does not buy rank. Restriction level (timer only, app shielding,
 * managed kiosk) never changes XP, so a student whose phone cannot be locked
 * down is not ranked below one whose phone can.
 */

export type ScoringRules = {
  durationMode: 'FLAT' | 'PER_MINUTE'
  basePerInterval: number
  /** PER_MINUTE only. */
  perMinute: number
  minEligibleFocusMinutes: number
  maxEligibleFocusMinutes: number
  /** Share of the planned focus that must actually have elapsed (pauses excluded). */
  minCompletionRatio: number
  maxPausesPerInterval: number
  frogBonus: number
  allCyclesBonus: number
  allCyclesMinCycles: number
  achievementXp: number
  dailyCap: number
  weeklyCap: number
  /** Session starts per day before further starts are refused. */
  maxSessionsPerDay: number
  /** Offline-synced intervals older than this are rejected. */
  offlineMaxAgeHours: number
}

export const DEFAULT_SCORING_RULES: ScoringRules = {
  durationMode: 'FLAT',
  basePerInterval: 25,
  perMinute: 1,
  minEligibleFocusMinutes: 20,
  maxEligibleFocusMinutes: 120,
  minCompletionRatio: 1,
  maxPausesPerInterval: 3,
  frogBonus: 10,
  allCyclesBonus: 10,
  allCyclesMinCycles: 2,
  achievementXp: 20,
  dailyCap: 300,
  weeklyCap: 1500,
  maxSessionsPerDay: 20,
  offlineMaxAgeHours: 72,
}

export type RuleIssue = { field: keyof ScoringRules | 'rules'; message: string }

const INT_FIELDS: (keyof ScoringRules)[] = [
  'basePerInterval', 'perMinute', 'minEligibleFocusMinutes', 'maxEligibleFocusMinutes', 'maxPausesPerInterval',
  'frogBonus', 'allCyclesBonus', 'allCyclesMinCycles', 'achievementXp', 'dailyCap', 'weeklyCap',
  'maxSessionsPerDay', 'offlineMaxAgeHours',
]

export function validateRules(rules: ScoringRules): RuleIssue[] {
  const issues: RuleIssue[] = []
  for (const f of INT_FIELDS) {
    const v = rules[f]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100_000) {
      issues.push({ field: f, message: 'Must be a whole number between 0 and 100000.' })
    }
  }
  if (rules.durationMode !== 'FLAT' && rules.durationMode !== 'PER_MINUTE') issues.push({ field: 'durationMode', message: 'Choose FLAT or PER_MINUTE.' })
  if (!(rules.minCompletionRatio > 0 && rules.minCompletionRatio <= 1)) issues.push({ field: 'minCompletionRatio', message: 'Between 0 (exclusive) and 1.' })
  if (rules.minEligibleFocusMinutes > rules.maxEligibleFocusMinutes) issues.push({ field: 'minEligibleFocusMinutes', message: 'Minimum eligible focus exceeds the maximum.' })
  if (rules.dailyCap > rules.weeklyCap) issues.push({ field: 'dailyCap', message: 'The daily cap cannot exceed the weekly cap.' })
  if (rules.minEligibleFocusMinutes < 1) issues.push({ field: 'minEligibleFocusMinutes', message: 'At least 1 minute.' })
  return issues
}

/** Fills any field missing from a stored rule set with the default. */
export function normalizeRules(raw: unknown): ScoringRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ScoringRules>
  return { ...DEFAULT_SCORING_RULES, ...r }
}

export type IntervalFacts = {
  plannedMinutes: number
  focusMs: number
  pauseCount: number
  outcome: 'COMPLETED' | 'ABANDONED'
}

export type IntervalScore = { eligible: boolean; points: number; reason: string | null }

/** XP for one focus interval before caps. Pure, so a rule change can be previewed. */
export function scoreInterval(rules: ScoringRules, f: IntervalFacts): IntervalScore {
  if (f.outcome !== 'COMPLETED') return { eligible: false, points: 0, reason: 'Interval was not completed.' }
  if (f.plannedMinutes < rules.minEligibleFocusMinutes) {
    return { eligible: false, points: 0, reason: `Focus shorter than ${rules.minEligibleFocusMinutes} minutes does not earn XP.` }
  }
  if (f.plannedMinutes > rules.maxEligibleFocusMinutes) {
    return { eligible: false, points: 0, reason: `Focus longer than ${rules.maxEligibleFocusMinutes} minutes does not earn XP.` }
  }
  const requiredMs = f.plannedMinutes * 60_000 * rules.minCompletionRatio
  // One second of tolerance for clock rounding between client and server.
  if (f.focusMs + 1000 < requiredMs) return { eligible: false, points: 0, reason: 'Not enough focus time elapsed.' }
  if (f.pauseCount > rules.maxPausesPerInterval) {
    return { eligible: false, points: 0, reason: `More than ${rules.maxPausesPerInterval} pauses in one interval.` }
  }
  const points = rules.durationMode === 'FLAT'
    ? rules.basePerInterval
    : rules.basePerInterval + Math.round(f.plannedMinutes * rules.perMinute)
  return { eligible: true, points, reason: null }
}

/** Trims an award to what the daily and weekly caps still allow. */
export function applyCaps(points: number, earnedToday: number, earnedThisWeek: number, rules: ScoringRules): { points: number; capped: boolean } {
  const room = Math.max(0, Math.min(rules.dailyCap - earnedToday, rules.weeklyCap - earnedThisWeek))
  if (points <= room) return { points, capped: false }
  return { points: room, capped: true }
}

export type PreviewRow = { label: string; plannedMinutes: number; current: number; proposed: number }

/**
 * Side-by-side XP for typical sessions under the current and proposed rules,
 * shown before a new version is published.
 */
export function previewRules(current: ScoringRules, proposed: ScoringRules): PreviewRow[] {
  const samples: { label: string; minutes: number }[] = [
    { label: 'Classic 25-minute focus', minutes: 25 },
    { label: '30-minute custom focus', minutes: 30 },
    { label: 'Extended 45-minute focus', minutes: 45 },
    { label: '60-minute custom focus', minutes: 60 },
    { label: '15-minute short focus', minutes: 15 },
  ]
  return samples.map((s) => {
    const facts: IntervalFacts = { plannedMinutes: s.minutes, focusMs: s.minutes * 60_000, pauseCount: 0, outcome: 'COMPLETED' }
    return {
      label: s.label,
      plannedMinutes: s.minutes,
      current: scoreInterval(current, facts).points,
      proposed: scoreInterval(proposed, facts).points,
    }
  })
}

/** Field-by-field difference, for the audit trail and the confirmation screen. */
export function diffRules(before: ScoringRules, after: ScoringRules): { field: string; from: unknown; to: unknown }[] {
  return (Object.keys(after) as (keyof ScoringRules)[])
    .filter((k) => before[k] !== after[k])
    .map((k) => ({ field: k, from: before[k], to: after[k] }))
}
