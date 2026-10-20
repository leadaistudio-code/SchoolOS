import { Prisma, type TapasyaFocusSession, type TapasyaRestrictionLevel } from '@prisma/client'
import type { z } from 'zod'
import type { AppContext } from '@/server/context'
import { ApiException, badRequest, conflict, notFound } from '@/server/api/response'
import { tenantTx } from '@/server/db/tenant-client'
import {
  apply,
  advance,
  initialState,
  isTerminal,
  EngineError,
  type EngineEffect,
  type EngineEvent,
  type EngineState,
  type PomodoroSettings,
} from '@/lib/tapasya/engine'
import { builtinPreset, resolveSessionSettings, type PresetFields } from '@/lib/tapasya/policy'
import { isRestrictionLevel } from '@/lib/tapasya/device'
import { getGlobalSettings, limitsFor, requireTapasyaEnabled, scoringAt } from './config'
import { currentStudent, limitOrThrow, type CurrentStudent } from './people'
import { awardAllCycles, awardInterval, capWindows, evaluateAchievements } from './xp'
import { refreshProjectionSafely } from './leaderboard'
import type { sessionEventSchema, startSessionSchema } from './schema'

type Tx = Prisma.TransactionClient
type StartInput = z.infer<typeof startSessionSchema>
type EventInput = z.infer<typeof sessionEventSchema>

const RESTRICTION_ORDER: TapasyaRestrictionLevel[] = ['TIMER_ONLY', 'PARTIAL', 'APP_SHIELDING', 'MANAGED_KIOSK']

/** A session is only as restricted as its weakest confirmed moment. */
function weaker(a: TapasyaRestrictionLevel, b: TapasyaRestrictionLevel): TapasyaRestrictionLevel {
  return RESTRICTION_ORDER.indexOf(a) <= RESTRICTION_ORDER.indexOf(b) ? a : b
}

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null)
const date = (n: number | null) => (n === null ? null : new Date(n))

function engineOf(row: TapasyaFocusSession): EngineState {
  const stored = row.engine as EngineState | null
  if (stored && typeof stored === 'object' && 'state' in stored) return stored
  return {
    state: row.state,
    nextPhase: 'FOCUS',
    currentCycle: row.currentCycle,
    completedCycles: row.completedCycles,
    phaseStartedAt: ms(row.phaseStartedAt),
    phaseEndsAt: ms(row.phaseEndsAt),
    pausedAt: ms(row.pausedAt),
    phasePausedMs: row.phasePausedMs,
    phasePauseCount: row.phasePauseCount,
    totalFocusMs: row.totalFocusMs,
    readySince: row.state === 'READY' ? ms(row.updatedAt) : null,
    longBreak: false,
  }
}

function columnsOf(s: EngineState) {
  return {
    state: s.state,
    currentCycle: s.currentCycle,
    completedCycles: s.completedCycles,
    phaseStartedAt: date(s.phaseStartedAt),
    phaseEndsAt: date(s.phaseEndsAt),
    pausedAt: date(s.pausedAt),
    phasePausedMs: s.phasePausedMs,
    phasePauseCount: s.phasePauseCount,
    totalFocusMs: s.totalFocusMs,
    engine: s as unknown as Prisma.InputJsonValue,
  }
}

export type SessionDto = {
  id: string
  state: string
  settings: PomodoroSettings
  engine: EngineState
  policySource: string
  task: { id: string; title: string } | null
  plannedCycles: number
  completedCycles: number
  totalFocusMinutes: number
  restrictionLevel: TapasyaRestrictionLevel
  offlineSynced: boolean
  startedAt: string
  endedAt: string | null
  endReason: string | null
  /** Server clock at response time — clients use it to correct their own clock. */
  serverNow: number
}

function toDto(row: TapasyaFocusSession & { task?: { id: string; title: string } | null }): SessionDto {
  return {
    id: row.id,
    state: row.state,
    settings: row.settings as unknown as PomodoroSettings,
    engine: engineOf(row),
    policySource: row.policySource,
    task: row.task ? { id: row.task.id, title: row.task.title } : null,
    plannedCycles: row.plannedCycles,
    completedCycles: row.completedCycles,
    totalFocusMinutes: Math.floor(row.totalFocusMs / 60_000),
    restrictionLevel: row.restrictionLevel,
    offlineSynced: row.offlineSynced,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    endReason: row.endReason,
    serverNow: Date.now(),
  }
}

async function loadPreset(ctx: AppContext, ref: string): Promise<{ preset: PresetFields; source: 'BUILTIN' | 'PERSONAL'; presetId: string | null }> {
  if (ref.startsWith('builtin:')) {
    const b = builtinPreset(ref.slice('builtin:'.length))
    if (!b) throw badRequest('Unknown built-in preset.')
    return { preset: b, source: 'BUILTIN', presetId: null }
  }
  const p = await ctx.db.tapasyaPreset.findFirst({ where: { id: ref, ownerUserId: ctx.user.userId, archivedAt: null } })
  if (!p) throw notFound('Preset')
  return { preset: p, source: 'PERSONAL', presetId: p.id }
}

type Applied = {
  row: TapasyaFocusSession
  intervals: { id: string; endedAt: Date }[]
  ended: boolean
}

/**
 * Persists an engine step: the new state (guarded by the session's version,
 * so two devices racing on one session cannot both apply), the intervals it
 * produced, and the XP they earned — all in the caller's transaction.
 */
async function persistStep(
  tx: Tx,
  ctx: AppContext,
  student: CurrentStudent,
  row: TapasyaFocusSession,
  next: EngineState,
  effects: EngineEffect[],
  opts: { offline: boolean; restriction?: { level: TapasyaRestrictionLevel; detail?: Record<string, unknown> } },
): Promise<Applied> {
  const settings = await getGlobalSettings()
  const tz = settings.timezone
  const level = opts.restriction ? weaker(row.restrictionLevel, opts.restriction.level) : row.restrictionLevel
  const ended = effects.find((e): e is Extract<EngineEffect, { kind: 'SESSION_ENDED' }> => e.kind === 'SESSION_ENDED')

  const res = await tx.tapasyaFocusSession.updateMany({
    where: { id: row.id, version: row.version },
    data: {
      ...columnsOf(next),
      version: { increment: 1 },
      restrictionLevel: level,
      ...(opts.restriction ? { restrictionDetail: { lastReport: opts.restriction.detail ?? {}, level: opts.restriction.level } as Prisma.InputJsonValue } : {}),
      ...(opts.offline ? { offlineSynced: true } : {}),
      ...(ended ? { endedAt: new Date(ended.at), endReason: ended.state, activeLock: null } : {}),
    },
  })
  if (res.count !== 1) throw new ApiException(409, 'SESSION_CHANGED', 'This session was updated from another device. Refresh and try again.')

  const offline = opts.offline || row.offlineSynced
  const who = { tenantId: ctx.tenant.id, userId: row.userId, studentId: student.id }
  const created: { id: string; endedAt: Date }[] = []

  for (const effect of effects) {
    if (effect.kind !== 'INTERVAL') continue
    const iv = effect.interval
    const endedAt = new Date(iv.endedAt)
    const ins = await tx.tapasyaFocusInterval.createMany({
      data: [{
        tenantId: ctx.tenant.id,
        sessionId: row.id,
        userId: row.userId,
        cycleIndex: iv.cycleIndex,
        plannedMinutes: iv.plannedMinutes,
        startedAt: new Date(iv.startedAt),
        endedAt,
        focusMs: iv.focusMs,
        pauseCount: iv.pauseCount,
        outcome: iv.outcome,
        restrictionLevel: level,
        offlineSynced: offline,
      }],
      skipDuplicates: true,
    })
    if (ins.count === 0) continue
    const interval = await tx.tapasyaFocusInterval.findFirstOrThrow({ where: { sessionId: row.id, cycleIndex: iv.cycleIndex } })
    created.push({ id: interval.id, endedAt })
    const scoring = await scoringAt(endedAt)
    await awardInterval(tx, who, interval, scoring, tz)
    if (row.taskId && iv.focusMs > 0) {
      await tx.tapasyaTask.updateMany({ where: { id: row.taskId }, data: { actualMinutes: { increment: Math.round(iv.focusMs / 60_000) } } })
    }
  }

  const updated = await tx.tapasyaFocusSession.findFirstOrThrow({ where: { id: row.id } })

  if (ended) {
    const endedAt = new Date(ended.at)
    const scoring = await scoringAt(endedAt)
    if (ended.state === 'COMPLETED' && updated.completedCycles >= updated.plannedCycles) {
      await awardAllCycles(tx, who, { ...updated, endedAt }, scoring, tz)
    }
    await evaluateAchievements(tx, who, scoring, tz)
  } else if (created.length) {
    await evaluateAchievements(tx, who, await scoringAt(new Date()), tz)
  }

  return { row: updated, intervals: created, ended: Boolean(ended) }
}

/** Brings a stale live session up to date (or to its end) before anything else happens. */
async function catchUp(tx: Tx, ctx: AppContext, student: CurrentStudent, row: TapasyaFocusSession, now: number): Promise<Applied> {
  const settings = row.settings as unknown as PomodoroSettings
  const { state, effects } = advance(settings, engineOf(row), now)
  if (effects.length === 0) return { row, intervals: [], ended: isTerminal(state.state) }
  return persistStep(tx, ctx, student, row, state, effects, { offline: false })
}

export async function getActiveSession(ctx: AppContext): Promise<SessionDto | null> {
  const row = await ctx.db.tapasyaFocusSession.findFirst({
    where: { userId: ctx.user.userId, activeLock: { not: null } },
    include: { task: { select: { id: true, title: true } } },
  })
  return row ? toDto(row) : null
}

export async function startSession(ctx: AppContext, input: StartInput, opts: { offlineSync?: boolean } = {}): Promise<{ session: SessionDto; notes: string[] }> {
  await requireTapasyaEnabled(ctx)
  const student = await currentStudent(ctx)
  await limitOrThrow(`tapasya:start:${ctx.user.userId}`, 30, 3600)

  const existing = await ctx.db.tapasyaFocusSession.findFirst({
    where: { userId: ctx.user.userId, clientSessionKey: input.clientSessionKey },
    include: { task: { select: { id: true, title: true } } },
  })
  if (existing) return { session: toDto(existing), notes: [] }

  const now = Date.now()
  const global = await getGlobalSettings()
  const scoring = await scoringAt(new Date(now))
  let startedAt = now
  let offline = false
  if (input.clientStartedAt) {
    const t = Date.parse(input.clientStartedAt)
    if (t > now + 60_000) throw badRequest('Start time is in the future.')
    if (now - t > scoring.rules.offlineMaxAgeHours * 3_600_000) throw badRequest('This offline session is too old to sync.')
    startedAt = Math.min(t, now)
    offline = true
  }

  const { limits } = await limitsFor(ctx)
  const { preset, source, presetId } = await loadPreset(ctx, input.presetRef)

  let task: { id: string; isMandatory: boolean; requiredFocusMinutes: number | null; requiredBreakMinutes: number | null; status: string } | null = null
  if (input.taskId) {
    task = await ctx.db.tapasyaTask.findFirst({
      where: { id: input.taskId, studentId: student.id, deletedAt: null },
      select: { id: true, isMandatory: true, requiredFocusMinutes: true, requiredBreakMinutes: true, status: true },
    })
    if (!task) throw notFound('Task')
    if (task.status === 'DONE' || task.status === 'CANCELLED') throw conflict('That task is already closed.')
  }

  const resolved = resolveSessionSettings({ preset, presetSource: source, plannedCycles: input.plannedCycles, limits, task })
  if (!resolved.ok) throw new ApiException(422, 'PRESET_OUT_OF_POLICY', resolved.issues[0]?.message ?? 'Preset is outside your school policy.', resolved.issues)

  const w = capWindows(new Date(startedAt), global.timezone)
  const startedToday = await ctx.db.tapasyaFocusSession.count({ where: { userId: ctx.user.userId, startedAt: { gte: w.dayStart, lt: w.dayEnd } } })
  if (startedToday >= scoring.rules.maxSessionsPerDay) {
    throw new ApiException(429, 'SESSION_LIMIT', `You can start up to ${scoring.rules.maxSessionsPerDay} sessions a day.`)
  }

  const reported = input.restriction && isRestrictionLevel(input.restriction.level) ? input.restriction.level : 'TIMER_ONLY'
  const first = apply(resolved.settings, initialState(startedAt), { type: 'START_FOCUS' }, startedAt)

  const row = await tenantTx(ctx.tenant.id, async (tx) => {
    const live = await tx.tapasyaFocusSession.findFirst({ where: { activeLock: ctx.user.userId } })
    let lock: string | null = ctx.user.userId
    if (live) {
      const caught = await catchUp(tx, ctx, student, live, now)
      if (!caught.ended) {
        // An offline session is history being uploaded, not a second live
        // timer: record it unlocked; syncSession ends it if it is still open.
        if (!opts.offlineSync) throw new ApiException(409, 'SESSION_ACTIVE', 'You already have a session running. Finish or end it first.', { sessionId: live.id })
        lock = null
      }
    }
    try {
      const created = await tx.tapasyaFocusSession.create({
        data: {
          tenantId: ctx.tenant.id,
          studentId: student.id,
          userId: ctx.user.userId,
          taskId: task?.id ?? null,
          presetId,
          settings: resolved.settings as unknown as Prisma.InputJsonValue,
          policySource: resolved.source,
          plannedCycles: resolved.settings.plannedCycles,
          ...columnsOf(first.state),
          startedAt: new Date(startedAt),
          clientSessionKey: input.clientSessionKey,
          activeLock: lock,
          restrictionLevel: reported,
          restrictionDetail: input.restriction?.detail ? (input.restriction.detail as Prisma.InputJsonValue) : undefined,
          deviceId: input.deviceId ?? null,
          offlineSynced: offline,
        },
        include: { task: { select: { id: true, title: true } } },
      })
      await tx.tapasyaSessionEvent.create({
        data: { tenantId: ctx.tenant.id, sessionId: created.id, type: 'START', clientEventId: `start:${input.clientSessionKey}`, clientAt: offline ? new Date(startedAt) : null, toState: 'FOCUS_ACTIVE', detail: { presetRef: input.presetRef, source: resolved.source } },
      })
      if (task && task.status === 'TODO') await tx.tapasyaTask.updateMany({ where: { id: task.id }, data: { status: 'IN_PROGRESS' } })
      return created
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiException(409, 'SESSION_ACTIVE', 'You already have a session running on another device.')
      }
      throw err
    }
  })

  return { session: toDto(row), notes: resolved.notes }
}

export type EventResult = { clientEventId: string; ok: boolean; duplicate?: boolean; code?: string; message?: string }

function resolveEventTime(ev: EventInput, row: TapasyaFocusSession, engine: EngineState, now: number, maxAgeHours: number): number {
  if (!ev.offline || !ev.clientAt) return now
  const t = Date.parse(ev.clientAt)
  if (Number.isNaN(t)) throw new EngineError('INVALID_TRANSITION', 'Bad event time.')
  if (now - t > maxAgeHours * 3_600_000) throw new EngineError('INVALID_TRANSITION', 'This offline event is too old to sync.')
  const floor = Math.max(row.startedAt.getTime(), engine.phaseStartedAt ?? 0, engine.pausedAt ?? 0, engine.readySince ?? 0)
  if (t < floor) throw new EngineError('INVALID_TRANSITION', 'This offline event is older than what the server already recorded.')
  return Math.min(t, now)
}

/**
 * Applies a batch of timer events to the caller's own session, in order.
 * Duplicates (same clientEventId) are acknowledged and skipped.
 */
export async function applySessionEvents(ctx: AppContext, sessionId: string, events: EventInput[]): Promise<{ session: SessionDto; results: EventResult[] }> {
  const student = await currentStudent(ctx)
  await limitOrThrow(`tapasya:events:${ctx.user.userId}`, 240, 600)
  const results: EventResult[] = []
  const touched: Date[] = []

  const finalRow = await tenantTx(ctx.tenant.id, async (tx) => {
    let row = await tx.tapasyaFocusSession.findFirst({ where: { id: sessionId, userId: ctx.user.userId } })
    if (!row) throw notFound('Session')
    const scoring = await scoringAt(new Date())

    for (const ev of events) {
      const dup = await tx.tapasyaSessionEvent.findFirst({ where: { sessionId: row.id, clientEventId: ev.clientEventId }, select: { id: true } })
      if (dup) {
        results.push({ clientEventId: ev.clientEventId, ok: true, duplicate: true })
        continue
      }
      const settings = row.settings as unknown as PomodoroSettings
      const before = engineOf(row)
      try {
        const at = resolveEventTime(ev, row, before, Date.now(), scoring.rules.offlineMaxAgeHours)
        const step = ev.type === 'SYNC'
          ? advance(settings, before, at)
          : apply(settings, before, { type: ev.type } as EngineEvent, at)
        const restriction = ev.restriction && isRestrictionLevel(ev.restriction.level)
          ? { level: ev.restriction.level, detail: ev.restriction.detail }
          : undefined
        if (step.effects.length || ev.type !== 'SYNC' || restriction) {
          const applied = await persistStep(tx, ctx, student, row, step.state, step.effects, { offline: Boolean(ev.offline), restriction })
          row = applied.row
          touched.push(...applied.intervals.map((i) => i.endedAt))
        }
        await tx.tapasyaSessionEvent.create({
          data: {
            tenantId: ctx.tenant.id,
            sessionId: row.id,
            type: ev.type,
            clientEventId: ev.clientEventId,
            clientAt: ev.clientAt ? new Date(ev.clientAt) : null,
            fromState: before.state,
            toState: step.state.state,
            detail: ev.offline ? { offline: true } : undefined,
          },
        })
        results.push({ clientEventId: ev.clientEventId, ok: true })
      } catch (err) {
        if (err instanceof EngineError) {
          results.push({ clientEventId: ev.clientEventId, ok: false, code: err.code, message: err.message })
          continue
        }
        throw err
      }
    }
    return tx.tapasyaFocusSession.findFirstOrThrow({ where: { id: row.id }, include: { task: { select: { id: true, title: true } } } })
  })

  if (touched.length || isTerminal(finalRow.state)) await refreshProjectionSafely(ctx.user.userId, touched)
  return { session: toDto(finalRow), results }
}

/**
 * Uploads a session that ran while the phone was offline: the start and its
 * queued events in one call. Its XP is PENDING until reconciliation checks it
 * against everything else the server knows (overlaps, age).
 */
export async function syncOfflineSession(ctx: AppContext, start: StartInput, events: EventInput[]): Promise<{ session: SessionDto; results: EventResult[] }> {
  if (!start.clientStartedAt) throw badRequest('An offline session needs its start time.')
  const { session } = await startSession(ctx, start, { offlineSync: true })
  const queued = events.map((e) => ({ ...e, offline: true }))
  const out = queued.length ? await applySessionEvents(ctx, session.id, queued) : { session, results: [] }
  const row = await ctx.db.tapasyaFocusSession.findFirst({ where: { id: session.id } })
  if (row && !row.activeLock && !isTerminal(row.state)) {
    // Close it where the phone's record stops, not at upload time, so no
    // unobserved minutes are credited.
    const lastSeen = [...queued].reverse().find((e) => e.clientAt)?.clientAt ?? start.clientStartedAt
    const ended = await applySessionEvents(ctx, session.id, [{ clientEventId: `sync-close:${start.clientSessionKey}`, type: 'INTERRUPT', offline: true, clientAt: lastSeen }])
    return { session: ended.session, results: out.results }
  }
  return out
}

export type SessionHistoryItem = {
  id: string
  state: string
  startedAt: string
  endedAt: string | null
  endReason: string | null
  task: { id: string; title: string } | null
  plannedCycles: number
  completedCycles: number
  focusMinutes: number
  restrictionLevel: TapasyaRestrictionLevel
  policySource: string
  settings: { focusMinutes: number; shortBreakMinutes: number }
  xp: { validated: number; pending: number; rejected: { reason: string | null }[] }
  offlineSynced: boolean
}

/** A student's sessions, newest first, with what each one earned and why. */
export async function sessionHistory(ctx: AppContext, studentId: string, page: number, pageSize: number): Promise<{ items: SessionHistoryItem[]; total: number }> {
  const where = { studentId }
  const [total, rows] = await Promise.all([
    ctx.db.tapasyaFocusSession.count({ where }),
    ctx.db.tapasyaFocusSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { task: { select: { id: true, title: true } }, intervals: { select: { id: true } } },
    }),
  ])
  const sourceIds = rows.flatMap((r) => [r.id, ...r.intervals.map((i) => i.id)])
  const xp = sourceIds.length
    ? await ctx.db.tapasyaXpEvent.findMany({ where: { sourceId: { in: sourceIds } }, select: { sourceId: true, points: true, status: true, rejectionReason: true } })
    : []
  const items = rows.map((r) => {
    const ids = new Set([r.id, ...r.intervals.map((i) => i.id)])
    const mine = xp.filter((x) => x.sourceId && ids.has(x.sourceId))
    const s = r.settings as unknown as PomodoroSettings
    return {
      id: r.id,
      state: r.state,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      endReason: r.endReason,
      task: r.task,
      plannedCycles: r.plannedCycles,
      completedCycles: r.completedCycles,
      focusMinutes: Math.floor(r.totalFocusMs / 60_000),
      restrictionLevel: r.restrictionLevel,
      policySource: r.policySource,
      settings: { focusMinutes: s.focusMinutes, shortBreakMinutes: s.shortBreakMinutes },
      xp: {
        validated: mine.filter((x) => x.status === 'VALIDATED').reduce((a, x) => a + x.points, 0),
        pending: mine.filter((x) => x.status === 'PENDING').reduce((a, x) => a + x.points, 0),
        rejected: mine.filter((x) => x.status === 'REJECTED').map((x) => ({ reason: x.rejectionReason })),
      },
      offlineSynced: r.offlineSynced,
    }
  })
  return { items, total }
}

/**
 * Ends sessions nobody has touched for a long time, so `activeLock` cannot
 * strand a student. Only sessions well past any auto-start grace are swept, so
 * this never starts a focus phase on someone's behalf.
 */
export async function sweepStaleSessions(ctx: AppContext, olderThanMinutes = 240): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)
  const stale = await ctx.db.tapasyaFocusSession.findMany({
    where: { activeLock: { not: null }, updatedAt: { lt: cutoff } },
    take: 200,
  })
  let swept = 0
  for (const row of stale) {
    const student = await ctx.db.student.findFirst({ where: { id: row.studentId }, select: { id: true, userId: true, firstName: true, lastName: true } })
    if (!student?.userId) continue
    const who: CurrentStudent = { id: student.id, userId: student.userId, firstName: student.firstName, lastName: student.lastName }
    const touched = await tenantTx(ctx.tenant.id, async (tx) => {
      const fresh = await tx.tapasyaFocusSession.findFirst({ where: { id: row.id } })
      if (!fresh || !fresh.activeLock) return []
      const settings = fresh.settings as unknown as PomodoroSettings
      let { state, effects } = advance(settings, engineOf(fresh), Date.now())
      if (!isTerminal(state.state)) {
        const ended = apply(settings, state, { type: 'INTERRUPT' }, Date.now())
        state = ended.state
        effects = [...effects, ...ended.effects]
      }
      const applied = await persistStep(tx, ctx, who, fresh, state, effects, { offline: false })
      return applied.intervals.map((i) => i.endedAt)
    })
    swept += 1
    if (touched.length) await refreshProjectionSafely(row.userId, touched)
  }
  return swept
}
