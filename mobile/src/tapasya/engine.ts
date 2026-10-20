/**
 * The Tapasya Pomodoro engine.
 *
 * A pure state machine over timestamps. Nothing here counts down: the state
 * records when the current phase started and when it is due to end, and every
 * reading of the timer is reconstructed from those and the current time. That
 * is what lets a session survive the app being killed, the phone restarting or
 * the screen locking — reopening simply asks "where are we now?".
 *
 * The server runs this to decide what really happened; the phone runs the same
 * file (mobile/src/tapasya/engine.ts is a verbatim copy, enforced by a test) to
 * draw the timer and to queue transitions while offline.
 *
 * Keep this file free of imports.
 */

export type SessionState =
  | 'READY'
  | 'FOCUS_ACTIVE'
  | 'FOCUS_PAUSED'
  | 'BREAK_ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'INTERRUPTED'
  | 'EXPIRED'

/** Client-only states: shown by the app, never stored on the server. */
export type ClientOnlyState = 'PENDING_SYNC' | 'CONTROL_UNAVAILABLE'

export type PomodoroSettings = {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number | null
  cyclesBeforeLongBreak: number
  plannedCycles: number
  autoStartBreak: boolean
  autoStartFocus: boolean
  allowPause: boolean
  allowSkipBreak: boolean
  /** A pause longer than this abandons the running interval. */
  maxPauseMinutes: number
  /** A session left waiting in READY longer than this expires. */
  idleExpiryMinutes: number
}

export type EngineState = {
  state: SessionState
  /** What READY is waiting to start. */
  nextPhase: 'FOCUS' | 'BREAK'
  /** 1-based cycle running now, or next to run. */
  currentCycle: number
  completedCycles: number
  phaseStartedAt: number | null
  phaseEndsAt: number | null
  pausedAt: number | null
  phasePausedMs: number
  phasePauseCount: number
  totalFocusMs: number
  /** When the session last entered READY — drives idle expiry. */
  readySince: number | null
  /** The current break is a long break. */
  longBreak: boolean
}

export type EngineEvent =
  | { type: 'START_FOCUS' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'START_BREAK' }
  | { type: 'SKIP_BREAK' }
  | { type: 'FINISH' }
  | { type: 'CANCEL' }
  | { type: 'INTERRUPT' }

export type IntervalRecord = {
  cycleIndex: number
  plannedMinutes: number
  startedAt: number
  endedAt: number
  focusMs: number
  pauseCount: number
  outcome: 'COMPLETED' | 'ABANDONED'
}

export type EngineEffect =
  | { kind: 'INTERVAL'; interval: IntervalRecord }
  | { kind: 'BREAK_STARTED'; at: number; long: boolean }
  | { kind: 'FOCUS_STARTED'; at: number; cycle: number; automatic: boolean }
  | { kind: 'SESSION_ENDED'; at: number; state: SessionState }

export type EngineResult = { state: EngineState; effects: EngineEffect[] }

export class EngineError extends Error {
  constructor(
    readonly code: 'INVALID_TRANSITION' | 'PAUSE_NOT_ALLOWED' | 'SKIP_NOT_ALLOWED' | 'SESSION_ENDED',
    message: string,
  ) {
    super(message)
    this.name = 'EngineError'
  }
}

const MINUTE = 60_000

/**
 * How late an automatic focus start may be observed and still happen. A break
 * that ended an hour ago while nobody had the app open must not start (and
 * complete) focus intervals retroactively — that would be XP for an empty room.
 */
export const AUTO_START_GRACE_MS = 2 * MINUTE

export const TERMINAL_STATES: readonly SessionState[] = ['COMPLETED', 'CANCELLED', 'INTERRUPTED', 'EXPIRED']

export function isTerminal(state: SessionState): boolean {
  return TERMINAL_STATES.includes(state)
}

export function initialState(now: number): EngineState {
  return {
    state: 'READY',
    nextPhase: 'FOCUS',
    currentCycle: 1,
    completedCycles: 0,
    phaseStartedAt: null,
    phaseEndsAt: null,
    pausedAt: null,
    phasePausedMs: 0,
    phasePauseCount: 0,
    totalFocusMs: 0,
    readySince: now,
    longBreak: false,
  }
}

function breakMinutesAfter(settings: PomodoroSettings, completedCycles: number): { minutes: number; long: boolean } {
  const every = Math.max(1, settings.cyclesBeforeLongBreak)
  if (settings.longBreakMinutes && completedCycles > 0 && completedCycles % every === 0) {
    return { minutes: settings.longBreakMinutes, long: true }
  }
  return { minutes: settings.shortBreakMinutes, long: false }
}

function startFocus(settings: PomodoroSettings, s: EngineState, at: number, automatic: boolean, effects: EngineEffect[]): EngineState {
  effects.push({ kind: 'FOCUS_STARTED', at, cycle: s.currentCycle, automatic })
  return {
    ...s,
    state: 'FOCUS_ACTIVE',
    nextPhase: 'FOCUS',
    phaseStartedAt: at,
    phaseEndsAt: at + settings.focusMinutes * MINUTE,
    pausedAt: null,
    phasePausedMs: 0,
    phasePauseCount: 0,
    readySince: null,
    longBreak: false,
  }
}

function startBreak(settings: PomodoroSettings, s: EngineState, at: number, effects: EngineEffect[]): EngineState {
  const b = breakMinutesAfter(settings, s.completedCycles)
  effects.push({ kind: 'BREAK_STARTED', at, long: b.long })
  return {
    ...s,
    state: 'BREAK_ACTIVE',
    nextPhase: 'BREAK',
    phaseStartedAt: at,
    phaseEndsAt: at + b.minutes * MINUTE,
    pausedAt: null,
    phasePausedMs: 0,
    phasePauseCount: 0,
    readySince: null,
    longBreak: b.long,
  }
}

function toReady(s: EngineState, at: number, nextPhase: 'FOCUS' | 'BREAK'): EngineState {
  return {
    ...s,
    state: 'READY',
    nextPhase,
    phaseStartedAt: null,
    phaseEndsAt: null,
    pausedAt: null,
    phasePausedMs: 0,
    phasePauseCount: 0,
    readySince: at,
    longBreak: false,
  }
}

function end(s: EngineState, at: number, state: SessionState, effects: EngineEffect[]): EngineState {
  effects.push({ kind: 'SESSION_ENDED', at, state })
  return { ...s, state, phaseStartedAt: null, phaseEndsAt: null, pausedAt: null, readySince: null }
}

/** Records the running focus interval as abandoned, if one is running. */
function abandonFocus(settings: PomodoroSettings, s: EngineState, at: number, effects: EngineEffect[]): EngineState {
  if ((s.state !== 'FOCUS_ACTIVE' && s.state !== 'FOCUS_PAUSED') || s.phaseStartedAt === null) return s
  const pausedNow = s.state === 'FOCUS_PAUSED' && s.pausedAt !== null ? at - s.pausedAt : 0
  const focusMs = Math.max(0, at - s.phaseStartedAt - s.phasePausedMs - pausedNow)
  effects.push({
    kind: 'INTERVAL',
    interval: {
      cycleIndex: s.currentCycle,
      plannedMinutes: settings.focusMinutes,
      startedAt: s.phaseStartedAt,
      endedAt: at,
      focusMs,
      pauseCount: s.phasePauseCount,
      outcome: 'ABANDONED',
    },
  })
  return { ...s, totalFocusMs: s.totalFocusMs + focusMs }
}

/**
 * Applies every time-driven transition that is due by `now`, at the exact
 * boundary it was due — not at `now`. A focus phase that ended while the phone
 * was locked ended when it ended, and the break that followed started then.
 */
export function advance(settings: PomodoroSettings, input: EngineState, now: number): EngineResult {
  let s = input
  const effects: EngineEffect[] = []

  for (let guard = 0; guard < 1000; guard += 1) {
    if (s.state === 'FOCUS_ACTIVE' && s.phaseEndsAt !== null && s.phaseStartedAt !== null && now >= s.phaseEndsAt) {
      const at = s.phaseEndsAt
      const focusMs = at - s.phaseStartedAt - s.phasePausedMs
      effects.push({
        kind: 'INTERVAL',
        interval: {
          cycleIndex: s.currentCycle,
          plannedMinutes: settings.focusMinutes,
          startedAt: s.phaseStartedAt,
          endedAt: at,
          focusMs,
          pauseCount: s.phasePauseCount,
          outcome: 'COMPLETED',
        },
      })
      s = { ...s, completedCycles: s.completedCycles + 1, totalFocusMs: s.totalFocusMs + focusMs }
      if (s.completedCycles >= settings.plannedCycles) {
        s = end(s, at, 'COMPLETED', effects)
        break
      }
      s = settings.autoStartBreak ? startBreak(settings, s, at, effects) : toReady(s, at, 'BREAK')
      continue
    }

    if (s.state === 'BREAK_ACTIVE' && s.phaseEndsAt !== null && now >= s.phaseEndsAt) {
      const at = s.phaseEndsAt
      s = { ...s, currentCycle: s.currentCycle + 1 }
      if (settings.autoStartFocus && now - at <= AUTO_START_GRACE_MS) {
        s = startFocus(settings, s, at, true, effects)
      } else {
        s = toReady(s, at, 'FOCUS')
      }
      continue
    }

    if (s.state === 'FOCUS_PAUSED' && s.pausedAt !== null && now - s.pausedAt > settings.maxPauseMinutes * MINUTE) {
      const at = s.pausedAt + settings.maxPauseMinutes * MINUTE
      s = abandonFocus(settings, s, at, effects)
      s = end(s, at, 'INTERRUPTED', effects)
      break
    }

    if (s.state === 'READY' && s.readySince !== null && now - s.readySince > settings.idleExpiryMinutes * MINUTE) {
      const at = s.readySince + settings.idleExpiryMinutes * MINUTE
      s = end(s, at, s.completedCycles > 0 ? 'COMPLETED' : 'EXPIRED', effects)
      break
    }

    break
  }

  return { state: s, effects }
}

/** Advances to `now`, then applies one user or system event. */
export function apply(settings: PomodoroSettings, input: EngineState, event: EngineEvent, now: number): EngineResult {
  const advanced = advance(settings, input, now)
  const effects = [...advanced.effects]
  let s = advanced.state

  if (isTerminal(s.state)) {
    throw new EngineError('SESSION_ENDED', 'This session has already ended.')
  }

  switch (event.type) {
    case 'START_FOCUS': {
      if (s.state !== 'READY') throw new EngineError('INVALID_TRANSITION', 'A phase is already running.')
      if (s.nextPhase === 'BREAK') {
        if (!settings.allowSkipBreak) throw new EngineError('SKIP_NOT_ALLOWED', 'Breaks cannot be skipped in this session.')
        s = { ...s, currentCycle: s.currentCycle + 1 }
      }
      s = startFocus(settings, s, now, false, effects)
      break
    }
    case 'PAUSE': {
      if (s.state !== 'FOCUS_ACTIVE') throw new EngineError('INVALID_TRANSITION', 'Only a running focus phase can be paused.')
      if (!settings.allowPause) throw new EngineError('PAUSE_NOT_ALLOWED', 'Pausing is not allowed in this session.')
      s = { ...s, state: 'FOCUS_PAUSED', pausedAt: now, phasePauseCount: s.phasePauseCount + 1 }
      break
    }
    case 'RESUME': {
      if (s.state !== 'FOCUS_PAUSED' || s.pausedAt === null) throw new EngineError('INVALID_TRANSITION', 'The session is not paused.')
      const pausedFor = now - s.pausedAt
      s = {
        ...s,
        state: 'FOCUS_ACTIVE',
        pausedAt: null,
        phasePausedMs: s.phasePausedMs + pausedFor,
        phaseEndsAt: (s.phaseEndsAt ?? now) + pausedFor,
      }
      break
    }
    case 'START_BREAK': {
      if (s.state !== 'READY' || s.nextPhase !== 'BREAK') throw new EngineError('INVALID_TRANSITION', 'There is no break waiting to start.')
      s = startBreak(settings, s, now, effects)
      break
    }
    case 'SKIP_BREAK': {
      if (!settings.allowSkipBreak) throw new EngineError('SKIP_NOT_ALLOWED', 'Breaks cannot be skipped in this session.')
      if (s.state === 'BREAK_ACTIVE' || (s.state === 'READY' && s.nextPhase === 'BREAK')) {
        s = { ...s, currentCycle: s.currentCycle + 1 }
        s = startFocus(settings, s, now, false, effects)
      } else {
        throw new EngineError('INVALID_TRANSITION', 'There is no break to skip.')
      }
      break
    }
    case 'FINISH': {
      s = abandonFocus(settings, s, now, effects)
      s = end(s, now, s.completedCycles > 0 ? 'COMPLETED' : 'CANCELLED', effects)
      break
    }
    case 'CANCEL': {
      s = abandonFocus(settings, s, now, effects)
      s = end(s, now, 'CANCELLED', effects)
      break
    }
    case 'INTERRUPT': {
      s = abandonFocus(settings, s, now, effects)
      s = end(s, now, 'INTERRUPTED', effects)
      break
    }
  }

  return { state: s, effects }
}

export type TimerView = {
  state: SessionState
  phase: 'FOCUS' | 'BREAK' | 'IDLE' | 'DONE'
  remainingMs: number
  elapsedMs: number
  phaseMs: number
  /** 0..1 progress through the current phase. */
  progress: number
  cycle: number
  plannedCycles: number
  completedCycles: number
  longBreak: boolean
  nextPhase: 'FOCUS' | 'BREAK'
}

/** What the screen should show at `now`. Pure reading — nothing is mutated. */
export function view(settings: PomodoroSettings, input: EngineState, now: number): TimerView {
  const { state: s } = advance(settings, input, now)
  const base = {
    state: s.state,
    cycle: Math.min(s.currentCycle, settings.plannedCycles),
    plannedCycles: settings.plannedCycles,
    completedCycles: s.completedCycles,
    longBreak: s.longBreak,
    nextPhase: s.nextPhase,
  }
  if (isTerminal(s.state)) return { ...base, phase: 'DONE', remainingMs: 0, elapsedMs: 0, phaseMs: 0, progress: 1 }
  if (s.phaseStartedAt === null || s.phaseEndsAt === null) {
    return { ...base, phase: 'IDLE', remainingMs: 0, elapsedMs: 0, phaseMs: 0, progress: 0 }
  }
  const phaseMs = s.phaseEndsAt - s.phaseStartedAt - s.phasePausedMs
  const effectiveNow = s.state === 'FOCUS_PAUSED' && s.pausedAt !== null ? s.pausedAt : now
  const remainingMs = Math.max(0, s.phaseEndsAt - effectiveNow)
  const elapsedMs = Math.max(0, phaseMs - remainingMs)
  return {
    ...base,
    phase: s.state === 'BREAK_ACTIVE' ? 'BREAK' : 'FOCUS',
    remainingMs,
    elapsedMs,
    phaseMs,
    progress: phaseMs > 0 ? Math.min(1, elapsedMs / phaseMs) : 0,
  }
}

/** mm:ss for a countdown; hours appear only when needed. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
