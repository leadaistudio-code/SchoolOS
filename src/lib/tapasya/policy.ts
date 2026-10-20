import type { PomodoroSettings } from './engine'

/**
 * Presets and the policy hierarchy.
 *
 *   platform limits  ⊇  school ranges  ⊇  teacher-assigned task  ⊇  student preset
 *
 * A preset outside the effective range is rejected with an explanation. It is
 * never silently clamped: a student who chose 50 minutes and got 45 without
 * being told would rightly stop trusting the timer.
 */

export type PresetFields = {
  name: string
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number | null
  cyclesBeforeLongBreak: number
  autoStartBreak: boolean
  autoStartFocus: boolean
  allowPause: boolean
  allowSkipBreak: boolean
  soundEnabled: boolean
  hapticsEnabled: boolean
}

export type BuiltinPreset = PresetFields & { key: 'CLASSIC' | 'EXTENDED' | 'EXTENDED_PLUS'; version: number; description: string }

/** Starting points, not rules. Saving one makes a personal copy. */
export const BUILTIN_PRESETS: readonly BuiltinPreset[] = [
  {
    key: 'CLASSIC',
    version: 1,
    name: 'Classic Pomodoro',
    description: '25 minutes of focus, then a 5-minute break.',
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    cyclesBeforeLongBreak: 4,
    autoStartBreak: true,
    autoStartFocus: false,
    allowPause: true,
    allowSkipBreak: true,
    soundEnabled: true,
    hapticsEnabled: true,
  },
  {
    key: 'EXTENDED',
    version: 1,
    name: 'Extended Focus',
    description: '45 minutes of focus, then a 10-minute break.',
    focusMinutes: 45,
    shortBreakMinutes: 10,
    longBreakMinutes: 20,
    cyclesBeforeLongBreak: 3,
    autoStartBreak: true,
    autoStartFocus: false,
    allowPause: true,
    allowSkipBreak: true,
    soundEnabled: true,
    hapticsEnabled: true,
  },
  {
    key: 'EXTENDED_PLUS',
    version: 1,
    name: 'Extended Focus Plus',
    description: '45 minutes of focus, then a 15-minute break.',
    focusMinutes: 45,
    shortBreakMinutes: 15,
    longBreakMinutes: 30,
    cyclesBeforeLongBreak: 3,
    autoStartBreak: true,
    autoStartFocus: false,
    allowPause: true,
    allowSkipBreak: true,
    soundEnabled: true,
    hapticsEnabled: true,
  },
]

export function builtinPreset(key: string): BuiltinPreset | null {
  return BUILTIN_PRESETS.find((p) => p.key === key) ?? null
}

/** The outer bound, set by the platform administrator. */
export type PlatformLimits = {
  minFocusMinutes: number
  maxFocusMinutes: number
  minBreakMinutes: number
  maxBreakMinutes: number
  maxLongBreakMinutes: number
  maxCyclesPerSession: number
  maxPauseMinutes: number
  idleExpiryMinutes: number
}

export const DEFAULT_PLATFORM_LIMITS: PlatformLimits = {
  minFocusMinutes: 5,
  maxFocusMinutes: 180,
  minBreakMinutes: 1,
  maxBreakMinutes: 60,
  maxLongBreakMinutes: 60,
  maxCyclesPerSession: 12,
  maxPauseMinutes: 30,
  idleExpiryMinutes: 120,
}

export type SchoolPolicyFields = {
  enabled: boolean
  minFocusMinutes: number
  maxFocusMinutes: number
  minBreakMinutes: number
  maxBreakMinutes: number
  allowPause: boolean
  allowSkipBreak: boolean
}

export type EffectiveLimits = {
  minFocusMinutes: number
  maxFocusMinutes: number
  minBreakMinutes: number
  maxBreakMinutes: number
  maxLongBreakMinutes: number
  maxCyclesPerSession: number
  allowPause: boolean
  allowSkipBreak: boolean
  maxPauseMinutes: number
  idleExpiryMinutes: number
}

export type PolicyIssue = { field: string; message: string }

/** Problems with a school's ranges relative to the platform bound. */
export function validateSchoolPolicy(school: SchoolPolicyFields, platform: PlatformLimits): PolicyIssue[] {
  const issues: PolicyIssue[] = []
  if (school.minFocusMinutes > school.maxFocusMinutes) issues.push({ field: 'minFocusMinutes', message: 'Shortest focus is longer than the longest.' })
  if (school.minBreakMinutes > school.maxBreakMinutes) issues.push({ field: 'minBreakMinutes', message: 'Shortest break is longer than the longest.' })
  if (school.minFocusMinutes < platform.minFocusMinutes) issues.push({ field: 'minFocusMinutes', message: `The platform minimum focus is ${platform.minFocusMinutes} minutes.` })
  if (school.maxFocusMinutes > platform.maxFocusMinutes) issues.push({ field: 'maxFocusMinutes', message: `The platform maximum focus is ${platform.maxFocusMinutes} minutes.` })
  if (school.minBreakMinutes < platform.minBreakMinutes) issues.push({ field: 'minBreakMinutes', message: `The platform minimum break is ${platform.minBreakMinutes} minutes.` })
  if (school.maxBreakMinutes > platform.maxBreakMinutes) issues.push({ field: 'maxBreakMinutes', message: `The platform maximum break is ${platform.maxBreakMinutes} minutes.` })
  return issues
}

/**
 * The intersection of platform and school limits. A school range saved before
 * the platform bound tightened is narrowed here, so the platform always wins.
 */
export function effectiveLimits(platform: PlatformLimits, school: SchoolPolicyFields | null): EffectiveLimits {
  const s = school
  return {
    minFocusMinutes: Math.max(platform.minFocusMinutes, s?.minFocusMinutes ?? platform.minFocusMinutes),
    maxFocusMinutes: Math.min(platform.maxFocusMinutes, s?.maxFocusMinutes ?? platform.maxFocusMinutes),
    minBreakMinutes: Math.max(platform.minBreakMinutes, s?.minBreakMinutes ?? platform.minBreakMinutes),
    maxBreakMinutes: Math.min(platform.maxBreakMinutes, s?.maxBreakMinutes ?? platform.maxBreakMinutes),
    maxLongBreakMinutes: platform.maxLongBreakMinutes,
    maxCyclesPerSession: platform.maxCyclesPerSession,
    allowPause: s?.allowPause ?? true,
    allowSkipBreak: s?.allowSkipBreak ?? true,
    maxPauseMinutes: platform.maxPauseMinutes,
    idleExpiryMinutes: platform.idleExpiryMinutes,
  }
}

function isWhole(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n)
}

/** Every reason a preset cannot be used under these limits. Empty means valid. */
export function validatePreset(p: PresetFields, limits: EffectiveLimits): PolicyIssue[] {
  const issues: PolicyIssue[] = []
  const name = p.name.trim()
  if (name.length < 1 || name.length > 40) issues.push({ field: 'name', message: 'Give the preset a name of up to 40 characters.' })
  if (!isWhole(p.focusMinutes) || p.focusMinutes < limits.minFocusMinutes || p.focusMinutes > limits.maxFocusMinutes) {
    issues.push({ field: 'focusMinutes', message: `Focus must be between ${limits.minFocusMinutes} and ${limits.maxFocusMinutes} minutes.` })
  }
  if (!isWhole(p.shortBreakMinutes) || p.shortBreakMinutes < limits.minBreakMinutes || p.shortBreakMinutes > limits.maxBreakMinutes) {
    issues.push({ field: 'shortBreakMinutes', message: `A short break must be between ${limits.minBreakMinutes} and ${limits.maxBreakMinutes} minutes.` })
  }
  if (p.longBreakMinutes !== null) {
    if (!isWhole(p.longBreakMinutes) || p.longBreakMinutes < p.shortBreakMinutes || p.longBreakMinutes > limits.maxLongBreakMinutes) {
      issues.push({ field: 'longBreakMinutes', message: `A long break must be at least the short break and at most ${limits.maxLongBreakMinutes} minutes.` })
    }
  }
  if (!isWhole(p.cyclesBeforeLongBreak) || p.cyclesBeforeLongBreak < 1 || p.cyclesBeforeLongBreak > limits.maxCyclesPerSession) {
    issues.push({ field: 'cyclesBeforeLongBreak', message: `Long breaks come after 1 to ${limits.maxCyclesPerSession} focus cycles.` })
  }
  return issues
}

export type TaskRequirement = {
  isMandatory: boolean
  requiredFocusMinutes: number | null
  requiredBreakMinutes: number | null
}

export type ResolvedSettings = {
  ok: boolean
  settings: PomodoroSettings
  source: 'BUILTIN' | 'PERSONAL' | 'TEACHER'
  /** Explicit, user-visible notes on anything a higher level decided. */
  notes: string[]
  issues: PolicyIssue[]
}

/**
 * Turns a chosen preset into the settings a session will run with.
 *
 * A mandatory teacher task fixes its own focus (and, if set, break) length —
 * the student is told so, and their saved preset is not touched. A school that
 * forbids pausing or skipping overrides the preset for that switch, also with a
 * note. Durations the preset sets outside the range fail validation instead.
 */
export function resolveSessionSettings(input: {
  preset: PresetFields
  presetSource: 'BUILTIN' | 'PERSONAL'
  plannedCycles: number
  limits: EffectiveLimits
  task?: TaskRequirement | null
}): ResolvedSettings {
  const { preset, limits, task } = input
  const notes: string[] = []
  let focusMinutes = preset.focusMinutes
  let shortBreakMinutes = preset.shortBreakMinutes
  let source: ResolvedSettings['source'] = input.presetSource

  if (task?.isMandatory && task.requiredFocusMinutes) {
    if (task.requiredFocusMinutes !== focusMinutes) {
      notes.push(`Your teacher set ${task.requiredFocusMinutes}-minute focus for this task. Your preset is unchanged.`)
    }
    focusMinutes = task.requiredFocusMinutes
    if (task.requiredBreakMinutes) shortBreakMinutes = task.requiredBreakMinutes
    source = 'TEACHER'
  }

  const candidate: PresetFields = { ...preset, focusMinutes, shortBreakMinutes }
  const issues = source === 'TEACHER'
    // A teacher's duration was validated against the school range when the task was saved.
    ? validatePreset(candidate, { ...limits, minFocusMinutes: 1, maxFocusMinutes: 600 })
    : validatePreset(candidate, limits)

  const plannedCycles = Math.trunc(input.plannedCycles)
  if (plannedCycles < 1 || plannedCycles > limits.maxCyclesPerSession) {
    issues.push({ field: 'plannedCycles', message: `Plan between 1 and ${limits.maxCyclesPerSession} focus cycles.` })
  }

  let allowPause = preset.allowPause
  if (allowPause && !limits.allowPause) {
    allowPause = false
    notes.push('Your school does not allow pausing a focus phase.')
  }
  let allowSkipBreak = preset.allowSkipBreak
  if (allowSkipBreak && !limits.allowSkipBreak) {
    allowSkipBreak = false
    notes.push('Your school does not allow skipping breaks.')
  }

  return {
    ok: issues.length === 0,
    source,
    notes,
    issues,
    settings: {
      focusMinutes,
      shortBreakMinutes,
      longBreakMinutes: preset.longBreakMinutes,
      cyclesBeforeLongBreak: preset.cyclesBeforeLongBreak,
      plannedCycles: Math.max(1, plannedCycles),
      autoStartBreak: preset.autoStartBreak,
      autoStartFocus: preset.autoStartFocus,
      allowPause,
      allowSkipBreak,
      maxPauseMinutes: limits.maxPauseMinutes,
      idleExpiryMinutes: limits.idleExpiryMinutes,
    },
  }
}
