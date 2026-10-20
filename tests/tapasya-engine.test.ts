import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUTO_START_GRACE_MS,
  EngineError,
  advance,
  apply,
  formatClock,
  initialState,
  view,
  type EngineState,
  type PomodoroSettings,
} from '../src/lib/tapasya/engine'
import {
  BUILTIN_PRESETS,
  DEFAULT_PLATFORM_LIMITS,
  builtinPreset,
  effectiveLimits,
  resolveSessionSettings,
  validatePreset,
  validateSchoolPolicy,
  type PresetFields,
} from '../src/lib/tapasya/policy'
import { DEFAULT_SCORING_RULES, applyCaps, diffRules, previewRules, scoreInterval, validateRules } from '../src/lib/tapasya/scoring'
import { currentStreak, isoWeekKey, localDate, periodKeys, startOfLocalDay } from '../src/lib/tapasya/periods'
import { aliasKey, validateAlias } from '../src/lib/tapasya/alias'
import { rankTasks, reviewDay, suggestPlan, type PlannerTask } from '../src/lib/tapasya/planner'
import { earnedAchievementKeys } from '../src/lib/tapasya/achievements'
import { demoLeaderboard } from '../src/lib/tapasya/demo'

const MIN = 60_000
const T0 = Date.parse('2026-10-19T04:00:00.000Z')

function settingsFor(preset: PresetFields, plannedCycles = 4, overrides: Partial<PomodoroSettings> = {}): PomodoroSettings {
  const resolved = resolveSessionSettings({
    preset,
    presetSource: 'BUILTIN',
    plannedCycles,
    limits: effectiveLimits(DEFAULT_PLATFORM_LIMITS, null),
  })
  expect(resolved.ok).toBe(true)
  return { ...resolved.settings, ...overrides }
}

const classic = builtinPreset('CLASSIC')!
const extended = builtinPreset('EXTENDED')!
const extendedPlus = builtinPreset('EXTENDED_PLUS')!

function started(settings: PomodoroSettings): EngineState {
  return apply(settings, initialState(T0), { type: 'START_FOCUS' }, T0).state
}

describe('built-in presets', () => {
  it('ships 25/5, 45/10 and 45/15 as starting points', () => {
    expect(BUILTIN_PRESETS.map((p) => [p.key, p.focusMinutes, p.shortBreakMinutes])).toEqual([
      ['CLASSIC', 25, 5],
      ['EXTENDED', 45, 10],
      ['EXTENDED_PLUS', 45, 15],
    ])
  })

  it.each([
    ['25/5', classic, 25, 5],
    ['45/10', extended, 45, 10],
    ['45/15', extendedPlus, 45, 15],
  ])('%s runs a focus phase then the matching break', (_l, preset, focus, brk) => {
    const s = settingsFor(preset)
    const r = advance(s, started(s), T0 + focus * MIN)
    expect(r.effects.find((e) => e.kind === 'INTERVAL')).toMatchObject({ interval: { outcome: 'COMPLETED', focusMs: focus * MIN, plannedMinutes: focus } })
    expect(r.state.state).toBe('BREAK_ACTIVE')
    expect(r.state.phaseEndsAt! - r.state.phaseStartedAt!).toBe(brk * MIN)
  })

  it('accepts a custom 50/8 preset within the limits', () => {
    const custom: PresetFields = { ...classic, name: 'Custom', focusMinutes: 50, shortBreakMinutes: 8 }
    const s = settingsFor(custom, 2)
    expect(s.focusMinutes).toBe(50)
    expect(s.shortBreakMinutes).toBe(8)
  })
})

describe('preset validation', () => {
  const limits = effectiveLimits(DEFAULT_PLATFORM_LIMITS, null)

  it.each([
    ['too short focus', { focusMinutes: 4 }],
    ['too long focus', { focusMinutes: 181 }],
    ['fractional focus', { focusMinutes: 25.5 }],
    ['zero break', { shortBreakMinutes: 0 }],
    ['break over 60', { shortBreakMinutes: 61 }],
    ['long break shorter than short', { longBreakMinutes: 3 }],
    ['no cycles before long break', { cyclesBeforeLongBreak: 0 }],
  ])('rejects %s', (_l, patch) => {
    expect(validatePreset({ ...classic, ...patch }, limits).length).toBeGreaterThan(0)
  })

  it('applies the narrower school range and explains it rather than clamping', () => {
    const school = { enabled: true, minFocusMinutes: 15, maxFocusMinutes: 60, minBreakMinutes: 3, maxBreakMinutes: 20, allowPause: true, allowSkipBreak: true }
    const schoolLimits = effectiveLimits(DEFAULT_PLATFORM_LIMITS, school)
    const issues = validatePreset({ ...classic, focusMinutes: 90 }, schoolLimits)
    expect(issues[0]?.message).toContain('between 15 and 60')
  })

  it('refuses a school range wider than the platform bound', () => {
    const issues = validateSchoolPolicy(
      { enabled: true, minFocusMinutes: 1, maxFocusMinutes: 300, minBreakMinutes: 1, maxBreakMinutes: 20, allowPause: true, allowSkipBreak: true },
      DEFAULT_PLATFORM_LIMITS,
    )
    expect(issues.map((i) => i.field)).toEqual(['minFocusMinutes', 'maxFocusMinutes'])
  })

  it('lets a mandatory teacher task fix focus, with a note, without touching the preset', () => {
    const r = resolveSessionSettings({
      preset: classic,
      presetSource: 'PERSONAL',
      plannedCycles: 2,
      limits: effectiveLimits(DEFAULT_PLATFORM_LIMITS, null),
      task: { isMandatory: true, requiredFocusMinutes: 30, requiredBreakMinutes: 5 },
    })
    expect(r.ok).toBe(true)
    expect(r.source).toBe('TEACHER')
    expect(r.settings.focusMinutes).toBe(30)
    expect(r.notes[0]).toContain('30-minute')
    expect(classic.focusMinutes).toBe(25)
  })

  it('turns off pausing when the school forbids it, and says so', () => {
    const school = { enabled: true, minFocusMinutes: 5, maxFocusMinutes: 90, minBreakMinutes: 1, maxBreakMinutes: 30, allowPause: false, allowSkipBreak: true }
    const r = resolveSessionSettings({ preset: classic, presetSource: 'BUILTIN', plannedCycles: 1, limits: effectiveLimits(DEFAULT_PLATFORM_LIMITS, school) })
    expect(r.settings.allowPause).toBe(false)
    expect(r.notes).toContain('Your school does not allow pausing a focus phase.')
  })
})

describe('Pomodoro lifecycle', () => {
  const s = settingsFor(classic, 4)

  it('long break after the configured number of cycles', () => {
    let st = started(s)
    const longBreaks: boolean[] = []
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const r = advance(s, st, st.phaseEndsAt!)
      const br = r.effects.find((e) => e.kind === 'BREAK_STARTED')
      longBreaks.push(br?.kind === 'BREAK_STARTED' ? br.long : false)
      st = apply(s, r.state, { type: 'SKIP_BREAK' }, r.state.phaseStartedAt! + 1000).state
    }
    expect(longBreaks).toEqual([false, false, false])
    const fourCycle = settingsFor(classic, 6)
    let st2 = started(fourCycle)
    let lastLong = false
    for (let cycle = 1; cycle <= 4; cycle += 1) {
      const r = advance(fourCycle, st2, st2.phaseEndsAt!)
      const br = r.effects.find((e) => e.kind === 'BREAK_STARTED')
      lastLong = br?.kind === 'BREAK_STARTED' ? br.long : false
      if (cycle < 4) st2 = apply(fourCycle, r.state, { type: 'SKIP_BREAK' }, r.state.phaseStartedAt! + 1000).state
    }
    expect(lastLong).toBe(true)
  })

  it('manual transition waits in READY for the student to start the break', () => {
    const manual = { ...s, autoStartBreak: false }
    const r = advance(manual, started(manual), T0 + 25 * MIN)
    expect(r.state.state).toBe('READY')
    expect(r.state.nextPhase).toBe('BREAK')
    const b = apply(manual, r.state, { type: 'START_BREAK' }, T0 + 26 * MIN)
    expect(b.state.state).toBe('BREAK_ACTIVE')
  })

  it('auto-starts the next focus only when the break end is observed promptly', () => {
    const auto = { ...s, autoStartFocus: true }
    const afterFocus = advance(auto, started(auto), T0 + 25 * MIN).state
    const prompt = advance(auto, afterFocus, T0 + 30 * MIN + 1000)
    expect(prompt.state.state).toBe('FOCUS_ACTIVE')
    expect(prompt.state.currentCycle).toBe(2)

    // Reopened an hour later: no focus intervals are invented for an empty room.
    const late = advance(auto, afterFocus, T0 + 30 * MIN + AUTO_START_GRACE_MS + 60 * MIN)
    expect(late.state.state).toBe('READY')
    expect(late.effects.filter((e) => e.kind === 'INTERVAL')).toHaveLength(0)
  })

  it('pause and resume push the end time back by the paused duration', () => {
    let st = started(s)
    st = apply(s, st, { type: 'PAUSE' }, T0 + 10 * MIN).state
    expect(view(s, st, T0 + 15 * MIN).remainingMs).toBe(15 * MIN)
    st = apply(s, st, { type: 'RESUME' }, T0 + 15 * MIN).state
    expect(st.phaseEndsAt).toBe(T0 + 30 * MIN)
    const r = advance(s, st, T0 + 30 * MIN)
    expect(r.effects[0]).toMatchObject({ interval: { focusMs: 25 * MIN, pauseCount: 1 } })
  })

  it('refuses to pause when pausing is not allowed', () => {
    const strict = { ...s, allowPause: false }
    expect(() => apply(strict, started(strict), { type: 'PAUSE' }, T0 + MIN)).toThrow(EngineError)
  })

  it('reconstructs the timer after backgrounding or a device restart from persisted timestamps', () => {
    const st = started(s)
    const persisted = JSON.parse(JSON.stringify(st)) as EngineState
    const v = view(s, persisted, T0 + 7 * MIN + 30_000)
    expect(v.phase).toBe('FOCUS')
    expect(formatClock(v.remainingMs)).toBe('17:30')
  })

  it('catches up across several phases at their exact boundaries after a long background', () => {
    const r = advance(s, started(s), T0 + 31 * MIN)
    expect(r.state.state).toBe('READY')
    expect(r.state.readySince).toBe(T0 + 30 * MIN)
    expect(r.effects.map((e) => e.kind)).toEqual(['INTERVAL', 'BREAK_STARTED'])
  })

  it('completes the session after the planned cycles', () => {
    const one = settingsFor(classic, 1)
    const r = advance(one, started(one), T0 + 25 * MIN)
    expect(r.state.state).toBe('COMPLETED')
    expect(r.effects.map((e) => e.kind)).toEqual(['INTERVAL', 'SESSION_ENDED'])
  })

  it('is idempotent: advancing an already-advanced state produces no new completion', () => {
    const first = advance(s, started(s), T0 + 25 * MIN)
    const again = advance(s, first.state, T0 + 25 * MIN)
    expect(again.effects).toHaveLength(0)
  })

  it('interrupts a session paused for longer than allowed and records the interval as abandoned', () => {
    let st = started(s)
    st = apply(s, st, { type: 'PAUSE' }, T0 + 5 * MIN).state
    const r = advance(s, st, T0 + 5 * MIN + 31 * MIN)
    expect(r.state.state).toBe('INTERRUPTED')
    expect(r.effects[0]).toMatchObject({ interval: { outcome: 'ABANDONED', focusMs: 5 * MIN } })
  })

  it('expires a session left idle in READY', () => {
    const r = advance(s, initialState(T0), T0 + 121 * MIN)
    expect(r.state.state).toBe('EXPIRED')
  })

  it('cancel abandons the running interval; finish keeps completed cycles', () => {
    const c = apply(s, started(s), { type: 'CANCEL' }, T0 + 10 * MIN)
    expect(c.state.state).toBe('CANCELLED')
    expect(c.effects[0]).toMatchObject({ interval: { outcome: 'ABANDONED' } })

    const afterOne = advance(s, started(s), T0 + 25 * MIN).state
    const f = apply(s, afterOne, { type: 'FINISH' }, T0 + 26 * MIN)
    expect(f.state.state).toBe('COMPLETED')
  })

  it('rejects any event after the session ended', () => {
    const c = apply(s, started(s), { type: 'CANCEL' }, T0 + MIN).state
    expect(() => apply(s, c, { type: 'START_FOCUS' }, T0 + 2 * MIN)).toThrow('already ended')
  })

  it('does not let a skipped break be forced when skipping is off', () => {
    const noSkip = { ...s, allowSkipBreak: false }
    const r = advance(noSkip, started(noSkip), T0 + 25 * MIN)
    expect(() => apply(noSkip, r.state, { type: 'SKIP_BREAK' }, T0 + 26 * MIN)).toThrow(EngineError)
  })
})

describe('XP scoring', () => {
  const rules = DEFAULT_SCORING_RULES
  const done = (m: number) => ({ plannedMinutes: m, focusMs: m * MIN, pauseCount: 0, outcome: 'COMPLETED' as const })

  it('awards the same base XP for 25 and 45 minutes by default, so length does not buy rank', () => {
    expect(scoreInterval(rules, done(25)).points).toBe(25)
    expect(scoreInterval(rules, done(45)).points).toBe(25)
  })

  it('awards duration-based XP only when the platform opts in', () => {
    const perMinute = { ...rules, durationMode: 'PER_MINUTE' as const, basePerInterval: 0 }
    expect(scoreInterval(perMinute, done(45)).points).toBe(45)
  })

  it('awards nothing for abandoned, too-short, under-elapsed or over-paused intervals', () => {
    expect(scoreInterval(rules, { ...done(25), outcome: 'ABANDONED' }).eligible).toBe(false)
    expect(scoreInterval(rules, done(10)).eligible).toBe(false)
    expect(scoreInterval(rules, { ...done(25), focusMs: 20 * MIN }).eligible).toBe(false)
    expect(scoreInterval(rules, { ...done(25), pauseCount: 4 }).eligible).toBe(false)
  })

  it('applies daily and weekly caps', () => {
    expect(applyCaps(25, 290, 400, rules)).toEqual({ points: 10, capped: true })
    expect(applyCaps(25, 0, 1500, rules)).toEqual({ points: 0, capped: true })
    expect(applyCaps(25, 0, 0, rules)).toEqual({ points: 25, capped: false })
  })

  it('validates and previews a proposed rule change', () => {
    expect(validateRules(rules)).toEqual([])
    expect(validateRules({ ...rules, dailyCap: 5000 }).map((i) => i.field)).toContain('dailyCap')
    const proposed = { ...rules, basePerInterval: 30 }
    const rows = previewRules(rules, proposed)
    expect(rows.find((r) => r.plannedMinutes === 25)).toMatchObject({ current: 25, proposed: 30 })
    expect(rows.find((r) => r.plannedMinutes === 15)).toMatchObject({ current: 0, proposed: 0 })
    expect(diffRules(rules, proposed)).toEqual([{ field: 'basePerInterval', from: 25, to: 30 }])
  })
})

describe('leaderboard periods', () => {
  it('uses one timezone, so late evening UTC is already tomorrow in India', () => {
    const at = new Date('2026-10-19T20:00:00.000Z')
    expect(localDate(at, 'Asia/Kolkata')).toBe('2026-10-20')
    expect(periodKeys(at)).toEqual({ ALL_TIME: 'all', DAILY: '2026-10-20', WEEKLY: '2026-W43', MONTHLY: '2026-10' })
  })

  it('computes ISO weeks across a year boundary', () => {
    expect(isoWeekKey('2026-12-31')).toBe('2026-W53')
    expect(isoWeekKey('2027-01-04')).toBe('2027-W01')
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01')
  })

  it('finds the instant a local day starts', () => {
    expect(startOfLocalDay('2026-10-19', 'Asia/Kolkata').toISOString()).toBe('2026-10-18T18:30:00.000Z')
  })

  it('keeps a streak alive until the day is over', () => {
    expect(currentStreak(['2026-10-17', '2026-10-18'], '2026-10-19')).toBe(2)
    expect(currentStreak(['2026-10-16', '2026-10-17'], '2026-10-19')).toBe(0)
  })
})

describe('aliases', () => {
  const person = { firstName: 'Aarav', lastName: 'Sharma' }
  it('accepts a neutral alias and keys it case- and space-insensitively', () => {
    expect(validateAlias('Quiet Comet', person)).toEqual([])
    expect(aliasKey(' Quiet  Comet ')).toBe(aliasKey('quiet_comet'))
  })
  it.each(['Aarav01', 'TheSharmaKid', 'ab', 'x98765432', 'Admin Bot', 'a@b'])('rejects %s', (alias) => {
    expect(validateAlias(alias, person).length).toBeGreaterThan(0)
  })
})

describe('Frog of the Day planner', () => {
  const today = '2026-10-19'
  const frogA: PlannerTask = { id: 'A', title: 'Science chapter', importance: 5, urgency: 3, difficulty: 5, estimatedMinutes: 45, dueOn: '2026-10-21', isTeacherAssigned: false, isMandatory: false, status: 'TODO' }
  const frogB: PlannerTask = { id: 'B', title: 'Maths revision', importance: 3, urgency: 3, difficulty: 2, estimatedMinutes: 25, dueOn: null, isTeacherAssigned: false, isMandatory: false, status: 'TODO' }

  it('puts the difficult, important chapter before the easier revision', () => {
    expect(rankTasks([frogB, frogA], today).map((t) => t.id)).toEqual(['A', 'B'])
  })

  it('plans in Pomodoro cycles and marks the frog', () => {
    const plan = suggestPlan({ tasks: [frogA, frogB], today, availableMinutes: 120, focusMinutes: 25, breakMinutes: 5 })
    expect(plan.items[0]).toMatchObject({ taskId: 'A', cycles: 2, isFrog: true })
    expect(plan.items[1]).toMatchObject({ taskId: 'B', cycles: 1, isFrog: false })
  })

  it('never drops a mandatory teacher task silently when time runs out', () => {
    const teacher: PlannerTask = { ...frogB, id: 'T', title: 'Teacher essay', isTeacherAssigned: true, isMandatory: true, estimatedMinutes: 90, importance: 1, urgency: 1, difficulty: 1 }
    const plan = suggestPlan({ tasks: [frogA, teacher], today, availableMinutes: 60, focusMinutes: 25, breakMinutes: 5 })
    expect(plan.deferred).toEqual([expect.objectContaining({ taskId: 'T', mandatory: true })])
  })

  it('end-of-day review keeps teacher tasks in place and suggests moving personal ones', () => {
    const review = reviewDay(
      [{ ...frogA, status: 'DONE', isPrimaryFrog: true }, frogB, { ...frogB, id: 'T', isMandatory: true, isTeacherAssigned: true }],
      today,
      { A: 50, B: 10 },
    )
    expect(review.frogDone).toBe(true)
    expect(review.totalMinutes).toBe(60)
    expect(review.unfinished.find((u) => u.taskId === 'T')?.suggestion).toContain('stays on your list')
    expect(review.unfinished.find((u) => u.taskId === 'B')?.suggestion).toBe('Move to tomorrow.')
  })
})

describe('achievements and demo data', () => {
  it('earns achievements from history', () => {
    expect(earnedAchievementKeys({ completedIntervals: 1, focusMinutes: 25, streakDays: 3, primaryFrogsDone: 0, activeDaysThisWeek: 1, intervalsThisWeek: 1 })).toEqual(['FIRST_FOCUS', 'STREAK_3'])
  })

  it('labels every example row as a demo sample', () => {
    for (const row of demoLeaderboard()) {
      expect(row.demo).toBe(true)
      expect(row.alias.startsWith('Sample Learner')).toBe(true)
    }
  })
})

describe('mobile mirrors', () => {
  it.each(['engine.ts', 'device.ts'])('mobile/src/tapasya/%s is a verbatim copy of src/lib/tapasya/%s', (file) => {
    const web = readFileSync(path.resolve(__dirname, '../src/lib/tapasya', file), 'utf8').replace(/\r\n/g, '\n')
    const mobile = readFileSync(path.resolve(__dirname, '../mobile/src/tapasya', file), 'utf8').replace(/\r\n/g, '\n')
    expect(mobile).toBe(web)
  })
})
