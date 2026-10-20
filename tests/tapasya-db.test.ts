import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => ({ bodies: [] as string[], ok: true }))

vi.mock('@/server/notifications', () => ({ notify: vi.fn(async () => undefined), notifyTenant: vi.fn(async () => undefined) }))
vi.mock('@/server/messaging/send', () => ({
  sendParentMessage: vi.fn(async (input: { to: string; body: string }) => {
    sent.bodies.push(input.body)
    return sent.ok ? { ok: true, channel: 'whatsapp' } : { ok: false, error: 'provider down' }
  }),
}))

import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import { ApiException } from '../src/server/api/response'
import { applySessionEvents, sessionHistory, startSession, syncOfflineSession } from '../src/server/modules/tapasya/sessions'
import { createPreset } from '../src/server/modules/tapasya/presets'
import { createOwnTask, deleteOwnTask, setFrogs, updateOwnTask, assignTasks, listTasks } from '../src/server/modules/tapasya/tasks'
import { xpSummary } from '../src/server/modules/tapasya/dashboard'
import { saveOwnProfile, guardianDecide, optOutSelf } from '../src/server/modules/tapasya/profiles'
import { getBoard, refreshProjection } from '../src/server/modules/tapasya/leaderboard'
import { requestUnlock, redeemCode, guardianDecideUnlock } from '../src/server/modules/tapasya/unlock'
import { saveSchoolPolicy } from '../src/server/modules/tapasya/admin'
import { reconcileTenant } from '../src/server/modules/tapasya/jobs'
import { scoringAt, SCHOOL_POLICY_DEFAULTS } from '../src/server/modules/tapasya/config'
import { demoLeaderboard } from '../src/lib/tapasya/demo'

/**
 * Tapasya services against the database, in two throwaway schools deleted
 * afterwards. Messaging and notifications are mocked: nothing is sent. Only
 * `Date` is faked, so timers are reconstructed from timestamps exactly as in
 * production.
 */
const prisma = new PrismaClient()
const TAG = `zztp${Date.now().toString(36)}`
const MIN = 60_000
const T0 = new Date('2026-10-19T04:00:00.000Z').getTime() // 09:30 in Asia/Kolkata

let tenantA: string
let tenantB: string
let student: AppContext
let student2: AppContext
let guardian: AppContext
let otherGuardian: AppContext
let admin: AppContext
let outsider: AppContext
let studentId: string
let student2Id: string
let now = T0
let seq = 0

const key = (p: string) => `${p}-${TAG}-${(seq += 1)}`
function setNow(ms: number) {
  now = ms
  vi.setSystemTime(new Date(ms))
}
const advanceMin = (m: number) => setNow(now + m * MIN)

function ctx(tenantId: string, userId: string, roleKeys: string[], perms: string[]): AppContext {
  const set = new Set(perms)
  return {
    user: {
      sessionId: 's_test', userId, tenantId, isSuperAdmin: false, firstName: 'T', lastName: 'User', email: null, phone: null,
      avatarUrl: null, displayName: null, mustChangePassword: false, roleKeys, permissions: set, impersonatedById: null,
    },
    tenant: { id: tenantId, name: 'Tapasya Test', timezone: 'Asia/Kolkata', currency: 'INR' } as never,
    db: tenantDb(tenantId),
    can: (p: string) => set.has(p),
    canAny: (...ps: string[]) => ps.some((p) => set.has(p)),
    require: (p: string) => {
      if (!set.has(p)) throw new Error(`Missing permission: ${p}`)
    },
  }
}

async function makeStudent(tenantId: string, n: number, first = 'Meera') {
  const user = await prisma.user.create({ data: { tenantId, firstName: first, lastName: `Test${n}` } })
  const s = await prisma.student.create({ data: { tenantId, userId: user.id, admissionNo: `${TAG}-${n}`, firstName: first, lastName: `Test${n}` } })
  return { user, s }
}

async function makeGuardian(tenantId: string, studentIdToLink: string, n: number) {
  const user = await prisma.user.create({ data: { tenantId, firstName: 'Asha', lastName: `Guardian${n}` } })
  const parent = await prisma.parent.create({ data: { tenantId, userId: user.id, firstName: 'Asha', lastName: `Guardian${n}`, phone: `98765${String(43210 + n)}` } })
  await prisma.studentGuardian.create({ data: { tenantId, studentId: studentIdToLink, parentId: parent.id, isPrimary: true } })
  return user
}

async function expectApiError(p: Promise<unknown>, code: string) {
  try {
    await p
  } catch (err) {
    expect(err).toBeInstanceOf(ApiException)
    expect((err as ApiException).code).toBe(code)
    return err as ApiException
  }
  throw new Error(`Expected ${code}, but the call succeeded`)
}

async function ledger(userId: string) {
  return prisma.tapasyaXpEvent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  setNow(T0)
  tenantA = (await prisma.tenant.create({ data: { slug: `${TAG}a`, name: `Tapasya A ${TAG}`, status: 'ACTIVE' } })).id
  tenantB = (await prisma.tenant.create({ data: { slug: `${TAG}b`, name: `Tapasya B ${TAG}`, status: 'ACTIVE' } })).id

  const a1 = await makeStudent(tenantA, 1)
  const a2 = await makeStudent(tenantA, 2, 'Kabir')
  const b1 = await makeStudent(tenantB, 3, 'Ravi')
  studentId = a1.s.id
  student2Id = a2.s.id
  const g1 = await makeGuardian(tenantA, a1.s.id, 1)
  const g2 = await makeGuardian(tenantA, a2.s.id, 2)
  const adminUser = await prisma.user.create({ data: { tenantId: tenantA, firstName: 'Admin', lastName: TAG } })

  student = ctx(tenantA, a1.user.id, ['STUDENT'], ['tapasya.use'])
  student2 = ctx(tenantA, a2.user.id, ['STUDENT'], ['tapasya.use'])
  guardian = ctx(tenantA, g1.id, ['PARENT'], ['tapasya.guardian'])
  otherGuardian = ctx(tenantA, g2.id, ['PARENT'], ['tapasya.guardian'])
  admin = ctx(tenantA, adminUser.id, ['SCHOOL_ADMIN'], ['tapasya.manage', 'tapasya.teach'])
  outsider = ctx(tenantB, b1.user.id, ['STUDENT'], ['tapasya.use'])
})

afterAll(async () => {
  vi.useRealTimers()
  const ids = [tenantA, tenantB].filter(Boolean)
  const users = await prisma.user.findMany({ where: { tenantId: { in: ids } }, select: { id: true } })
  const profiles = await prisma.globalLeaderboardProfile.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { id: true } })
  await prisma.globalLeaderboardSnapshot.deleteMany({ where: { profileId: { in: profiles.map((p) => p.id) } } })
  await prisma.globalLeaderboardProfile.deleteMany({ where: { id: { in: profiles.map((p) => p.id) } } })
  for (const tenantId of ids) {
    await prisma.tapasyaXpEvent.deleteMany({ where: { tenantId } })
    await prisma.tapasyaUserAchievement.deleteMany({ where: { tenantId } })
    await prisma.tapasyaUnlockRequest.deleteMany({ where: { tenantId } })
    await prisma.tapasyaSessionEvent.deleteMany({ where: { tenantId } })
    await prisma.tapasyaFocusInterval.deleteMany({ where: { tenantId } })
    await prisma.tapasyaFocusSession.deleteMany({ where: { tenantId } })
    await prisma.tapasyaTask.deleteMany({ where: { tenantId } })
    await prisma.tapasyaPreset.deleteMany({ where: { tenantId } })
    await prisma.tapasyaDevice.deleteMany({ where: { tenantId } })
    await prisma.tapasyaSchoolPolicy.deleteMany({ where: { tenantId } })
    await prisma.auditLog.deleteMany({ where: { tenantId } })
    await prisma.studentGuardian.deleteMany({ where: { tenantId } })
    await prisma.parent.deleteMany({ where: { tenantId } })
    await prisma.student.deleteMany({ where: { tenantId } })
    await prisma.user.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } })
  }
  await prisma.$disconnect()
})

describe('focus sessions and XP', () => {
  let sessionId: string

  it('starts once per client key and refuses a second live session', async () => {
    const k = key('s')
    const first = await startSession(student, { clientSessionKey: k, presetRef: 'builtin:CLASSIC', plannedCycles: 2 })
    sessionId = first.session.id
    expect(first.session.state).toBe('FOCUS_ACTIVE')
    expect(first.session.settings.focusMinutes).toBe(25)

    const retry = await startSession(student, { clientSessionKey: k, presetRef: 'builtin:CLASSIC', plannedCycles: 2 })
    expect(retry.session.id).toBe(sessionId)

    await expectApiError(startSession(student, { clientSessionKey: key('s'), presetRef: 'builtin:CLASSIC', plannedCycles: 1 }), 'SESSION_ACTIVE')
  })

  it('awards interval XP exactly once, at the reconstructed boundary', async () => {
    advanceMin(26)
    const eventId = key('e')
    const out = await applySessionEvents(student, sessionId, [{ clientEventId: eventId, type: 'SYNC' }])
    expect(out.session.state).toBe('BREAK_ACTIVE')
    expect(out.session.completedCycles).toBe(1)

    const again = await applySessionEvents(student, sessionId, [{ clientEventId: eventId, type: 'SYNC' }])
    expect(again.results[0]!.duplicate).toBe(true)

    const rows = (await ledger(student.user.userId)).filter((r) => r.eventType === 'FOCUS_INTERVAL')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.points).toBe(25)
    expect(rows[0]!.status).toBe('VALIDATED')
    expect(rows[0]!.occurredAt.getTime()).toBe(T0 + 25 * MIN)
  })

  it('completes the session with the all-cycles bonus and first achievement', async () => {
    advanceMin(5) // break over → READY (auto-start focus is off)
    await applySessionEvents(student, sessionId, [{ clientEventId: key('e'), type: 'SYNC' }])
    await applySessionEvents(student, sessionId, [{ clientEventId: key('e'), type: 'START_FOCUS' }])
    advanceMin(25)
    const out = await applySessionEvents(student, sessionId, [{ clientEventId: key('e'), type: 'SYNC' }])
    expect(out.session.state).toBe('COMPLETED')

    const rows = await ledger(student.user.userId)
    const sum = (t: string) => rows.filter((r) => r.eventType === t).reduce((a, r) => a + r.points, 0)
    expect(sum('FOCUS_INTERVAL')).toBe(50)
    expect(sum('ALL_CYCLES_BONUS')).toBe(10)
    expect(rows.filter((r) => r.eventType === 'ACHIEVEMENT').map((r) => r.sourceId)).toContain('FIRST_FOCUS')

    const summary = await xpSummary(student, student.user.userId)
    expect(summary.totalXp).toBe(rows.reduce((a, r) => a + (r.status === 'VALIDATED' ? r.points : 0), 0))
  })

  it('abandons an interval paused past the limit and records why it earned nothing', async () => {
    advanceMin(5)
    const { session } = await startSession(student, { clientSessionKey: key('s'), presetRef: 'builtin:CLASSIC', plannedCycles: 1 })
    advanceMin(3)
    await applySessionEvents(student, session.id, [{ clientEventId: key('e'), type: 'PAUSE' }])
    advanceMin(45)
    const out = await applySessionEvents(student, session.id, [{ clientEventId: key('e'), type: 'SYNC' }])
    expect(out.session.state).toBe('INTERRUPTED')
    const history = await sessionHistory(student, studentId, 1, 5)
    const item = history.items.find((i) => i.id === session.id)!
    expect(item.xp.validated).toBe(0)
    expect(item.xp.rejected[0]!.reason).toMatch(/not completed/i)
  })

  it('rejects a preset outside the school range, without clamping it', async () => {
    const err = await expectApiError(createPreset(student, {
      name: 'Marathon', focusMinutes: 100, shortBreakMinutes: 10, longBreakMinutes: null, cyclesBeforeLongBreak: 2,
      autoStartBreak: true, autoStartFocus: false, allowPause: true, allowSkipBreak: true, soundEnabled: true, hapticsEnabled: true,
    }), 'PRESET_OUT_OF_POLICY')
    expect(err.message).toMatch(/between 10 and 90/)
  })

  it('applies a school ban on pausing with an explicit note', async () => {
    await saveSchoolPolicy(admin, { ...SCHOOL_POLICY_DEFAULTS, allowPause: false })
    advanceMin(5)
    const started = await startSession(student, { clientSessionKey: key('s'), presetRef: 'builtin:CLASSIC', plannedCycles: 1 })
    expect(started.notes.join(' ')).toMatch(/does not allow pausing/)
    await applySessionEvents(student, started.session.id, [{ clientEventId: key('e'), type: 'PAUSE' }]).then((r) => {
      expect(r.results[0]!.ok).toBe(false)
      expect(r.results[0]!.code).toBe('PAUSE_NOT_ALLOWED')
    })
    await applySessionEvents(student, started.session.id, [{ clientEventId: key('e'), type: 'CANCEL' }])
    await saveSchoolPolicy(admin, { ...SCHOOL_POLICY_DEFAULTS })
  })

  it('keeps sessions isolated between schools', async () => {
    await expectApiError(applySessionEvents(outsider, sessionId, [{ clientEventId: key('e'), type: 'SYNC' }]), 'NOT_FOUND')
    const seen = await sessionHistory(outsider, studentId, 1, 50)
    expect(seen.items).toHaveLength(0)
    const outsiderXp = await xpSummary(outsider, student.user.userId)
    expect(outsiderXp.totalXp).toBe(0)
  })
})

describe('offline sync', () => {
  it('holds offline XP as pending, then validates it', async () => {
    advanceMin(60)
    const startedAt = new Date(now - 40 * MIN).toISOString()
    const out = await syncOfflineSession(student2, { clientSessionKey: key('off'), presetRef: 'builtin:CLASSIC', plannedCycles: 1, clientStartedAt: startedAt }, [
      { clientEventId: key('e'), type: 'SYNC', clientAt: new Date(now - 10 * MIN).toISOString() },
    ])
    expect(out.session.state).toBe('COMPLETED')
    const before = (await ledger(student2.user.userId)).filter((r) => r.eventType === 'FOCUS_INTERVAL')
    expect(before.map((r) => r.status)).toEqual(['PENDING'])
    expect((await xpSummary(student2, student2.user.userId)).totalXp).toBe(0)

    const r = await reconcileTenant(tenantA)
    expect(r.validated).toBeGreaterThanOrEqual(1)
    const after = (await ledger(student2.user.userId)).filter((x) => x.eventType === 'FOCUS_INTERVAL')
    expect(after[0]!.status).toBe('VALIDATED')
  })

  it('rejects offline minutes that overlap a session already recorded', async () => {
    const startedAt = new Date(now - 41 * MIN).toISOString()
    await syncOfflineSession(student2, { clientSessionKey: key('off'), presetRef: 'builtin:CLASSIC', plannedCycles: 1, clientStartedAt: startedAt }, [
      { clientEventId: key('e'), type: 'SYNC', clientAt: new Date(now - 5 * MIN).toISOString() },
    ])
    await reconcileTenant(tenantA)
    const rows = (await ledger(student2.user.userId)).filter((x) => x.eventType === 'FOCUS_INTERVAL')
    expect(rows.map((r) => r.status).sort()).toEqual(['REJECTED', 'VALIDATED'])
    expect(rows.find((r) => r.status === 'REJECTED')!.rejectionReason).toMatch(/overlaps/i)
  })
})

describe('tasks and frogs', () => {
  it('pays the frog bonus once, only with real focus on the task', async () => {
    advanceMin(30)
    const t = await createOwnTask(student, { title: 'Physics numericals', category: 'HOMEWORK', difficulty: 5, importance: 5, urgency: 4, estimatedMinutes: 25 })
    await setFrogs(student, { taskIds: [t.id], primaryTaskId: t.id })

    const s = await startSession(student, { clientSessionKey: key('s'), presetRef: 'builtin:CLASSIC', plannedCycles: 1, taskId: t.id })
    advanceMin(25)
    await applySessionEvents(student, s.session.id, [{ clientEventId: key('e'), type: 'SYNC' }])
    await updateOwnTask(student, t.id, { status: 'DONE', reflection: 'Done before lunch' })
    await updateOwnTask(student, t.id, { status: 'IN_PROGRESS' })
    await updateOwnTask(student, t.id, { status: 'DONE' })

    const frogs = (await ledger(student.user.userId)).filter((r) => r.eventType === 'FROG_BONUS')
    expect(frogs).toHaveLength(1)
    expect(frogs[0]!.points).toBe(10)

    const lazy = await createOwnTask(student, { title: 'Ticked without study', category: 'PERSONAL', difficulty: 1, importance: 1, urgency: 1, estimatedMinutes: 25 })
    await updateOwnTask(student, lazy.id, { status: 'DONE' })
    expect((await ledger(student.user.userId)).filter((r) => r.eventType === 'FROG_BONUS')).toHaveLength(1)
  })

  it('protects teacher-mandated tasks and uses the teacher duration', async () => {
    await assignTasks(admin, {
      studentIds: [studentId], title: 'Revise chapter 4', category: 'TEACHER_GOAL', difficulty: 3, importance: 4, urgency: 4,
      estimatedMinutes: 30, dueOn: '2026-10-20', isMandatory: true, studentCanEdit: false, requiredFocusMinutes: 30, requiredBreakMinutes: 5,
    })
    const task = (await listTasks(student, studentId)).find((t) => t.title === 'Revise chapter 4')!
    await expectApiError(deleteOwnTask(student, task.id), 'TEACHER_TASK_LOCKED')
    await expectApiError(updateOwnTask(student, task.id, { status: 'CANCELLED' }), 'TEACHER_TASK_LOCKED')
    await expectApiError(updateOwnTask(student, task.id, { dueOn: '2026-10-25' }), 'TEACHER_TASK_LOCKED')
    await updateOwnTask(student, task.id, { notes: 'Started the summary' })

    advanceMin(5)
    const s = await startSession(student, { clientSessionKey: key('s'), presetRef: 'builtin:CLASSIC', plannedCycles: 1, taskId: task.id })
    expect(s.session.settings.focusMinutes).toBe(30)
    expect(s.session.policySource).toBe('TEACHER')
    expect(s.notes.join(' ')).toMatch(/teacher set 30-minute/i)
    await applySessionEvents(student, s.session.id, [{ clientEventId: key('e'), type: 'CANCEL' }])
  })
})

describe('global leaderboard', () => {
  it('shows nothing until a guardian consents, then only alias and XP', async () => {
    await expectApiError(saveOwnProfile(student, { alias: 'MeeraStar', avatarKey: 'owl', showBadges: true }), 'ALIAS_INVALID')
    const p = await saveOwnProfile(student, { alias: `Owl ${TAG.slice(-6)}`, avatarKey: 'owl', showBadges: true })
    expect(p.status).toBe('PENDING_GUARDIAN')

    const before = await getBoard({ period: 'ALL_TIME', page: 1, pageSize: 50, viewerUserId: student.user.userId })
    expect(before.rows.some((r) => r.isYou)).toBe(false)
    expect(before.you?.rank).toBe(0)

    await expectApiError(guardianDecide(otherGuardian, studentId, 'APPROVE'), 'FORBIDDEN')
    await guardianDecide(guardian, studentId, 'APPROVE')

    const board = await getBoard({ period: 'ALL_TIME', page: 1, pageSize: 50, viewerUserId: student.user.userId })
    const me = board.rows.find((r) => r.isYou)!
    const ledgerXp = (await ledger(student.user.userId)).filter((r) => r.status === 'VALIDATED').reduce((a, r) => a + r.points, 0)
    expect(me.xp).toBe(ledgerXp)
    expect(board.you!.rank).toBe(me.rank)
    expect(Object.keys(me).sort()).toEqual(['alias', 'avatarKey', 'badges', 'isYou', 'movement', 'rank', 'xp'])
    const serialized = JSON.stringify(board)
    for (const leak of [tenantA, studentId, student.user.userId, 'Meera', 'Tapasya A']) expect(serialized).not.toContain(leak)
    expect(board.demo).toBe(false)
    expect(board.rows.some((r) => r.alias.startsWith('Sample Learner'))).toBe(false)
    expect(demoLeaderboard().every((r) => r.demo)).toBe(true)
  })

  it('recomputes idempotently and drops entries on opt-out', async () => {
    await refreshProjection(student.user.userId)
    await refreshProjection(student.user.userId)
    const profile = await prisma.globalLeaderboardProfile.findUniqueOrThrow({ where: { userId: student.user.userId } })
    const entries = await prisma.globalLeaderboardEntry.findMany({ where: { profileId: profile.id, period: 'ALL_TIME' } })
    expect(entries).toHaveLength(1)

    await optOutSelf(student)
    expect(await prisma.globalLeaderboardEntry.count({ where: { profileId: profile.id } })).toBe(0)
    expect((await ledger(student.user.userId)).length).toBeGreaterThan(0)
  })

  it('hides a school when it switches participation off', async () => {
    await saveOwnProfile(student, { alias: `Owl ${TAG.slice(-6)}`, avatarKey: 'owl', showBadges: false })
    await guardianDecide(guardian, studentId, 'APPROVE')
    await saveSchoolPolicy(admin, { ...SCHOOL_POLICY_DEFAULTS, globalLeaderboardAllowed: false })
    const p = await prisma.globalLeaderboardProfile.findUniqueOrThrow({ where: { userId: student.user.userId } })
    expect(p.status).toBe('SCHOOL_DISABLED')
    expect(await prisma.globalLeaderboardEntry.count({ where: { profileId: p.id } })).toBe(0)
    await saveSchoolPolicy(admin, { ...SCHOOL_POLICY_DEFAULTS })
    expect((await prisma.globalLeaderboardProfile.findUniqueOrThrow({ where: { userId: student.user.userId } })).status).toBe('ACTIVE')
  })

  it('uses the scoring version in force, not a future one', async () => {
    const future = await prisma.globalScoringConfig.create({
      data: { version: 900_000 + Math.floor(Math.random() * 99_999), rules: { basePerInterval: 999 }, effectiveFrom: new Date('2099-01-01'), reason: `test ${TAG}`, createdById: 'test' },
    })
    try {
      const active = await scoringAt(new Date(now))
      expect(active.rules.basePerInterval).not.toBe(999)
    } finally {
      await prisma.globalScoringConfig.delete({ where: { id: future.id } })
    }
  })
})

describe('guardian unlock', () => {
  const code = () => /code (\d{6})/.exec(sent.bodies.at(-1) ?? '')?.[1]

  it('approves with the guardian code once, and never again', async () => {
    const r = await requestUnlock(student, { idempotencyKey: key('u'), action: 'OPEN_APPS', reason: 'Need to call my tutor', requestedMinutes: 10 })
    expect(r.status).toBe('PENDING')
    expect(r.deliveryChannel).toBe('whatsapp')
    const c = code()!
    expect(c).toMatch(/^\d{6}$/)

    const wrong = c === '000000' ? '111111' : '000000'
    await expectApiError(redeemCode(student, r.id, wrong), 'UNLOCK_WRONG_CODE')
    const ok = await redeemCode(student, r.id, c)
    expect(ok.status).toBe('APPROVED')
    expect(new Date(ok.grantEndsAt!).getTime() - new Date(ok.grantStartsAt!).getTime()).toBe(10 * MIN)
    await expectApiError(redeemCode(student, r.id, c), 'UNLOCK_NOT_PENDING')

    const row = await prisma.tapasyaUnlockRequest.findUniqueOrThrow({ where: { id: r.id } })
    expect(row.codeHash).toBeNull()
    const audits = await prisma.auditLog.findMany({ where: { tenantId: tenantA, action: { startsWith: 'tapasya.unlock' } } })
    expect(JSON.stringify(audits)).not.toContain(c)
  })

  it('is idempotent per client key and locks after five wrong codes', async () => {
    const k = key('u')
    const a = await requestUnlock(student, { idempotencyKey: k, action: 'END_SESSION', reason: 'Feeling unwell', requestedMinutes: 5 })
    const b = await requestUnlock(student, { idempotencyKey: k, action: 'END_SESSION', reason: 'Feeling unwell', requestedMinutes: 5 })
    expect(b.id).toBe(a.id)
    const c = code()!
    const wrong = c === '000000' ? '111111' : '000000'
    for (let i = 0; i < 4; i += 1) await expectApiError(redeemCode(student, a.id, wrong), 'UNLOCK_WRONG_CODE')
    await expectApiError(redeemCode(student, a.id, wrong), 'UNLOCK_LOCKED')
    await expectApiError(redeemCode(student, a.id, c), 'UNLOCK_NOT_PENDING')
  })

  it('expires codes and lets only a linked guardian decide', async () => {
    const r = await requestUnlock(student, { idempotencyKey: key('u'), action: 'OPEN_APPS', reason: 'Project call', requestedMinutes: 15 })
    await expectApiError(guardianDecideUnlock(otherGuardian, r.id, { decision: 'APPROVE' }), 'FORBIDDEN')
    const decided = await guardianDecideUnlock(guardian, r.id, { decision: 'APPROVE', minutes: 5 })
    expect(decided.status).toBe('APPROVED')
    expect(decided.decidedVia).toBe('GUARDIAN_APP')

    const late = await requestUnlock(student, { idempotencyKey: key('u'), action: 'OPEN_APPS', reason: 'Late request', requestedMinutes: 5 })
    const c = code()!
    advanceMin(11)
    await expectApiError(redeemCode(student, late.id, c), 'UNLOCK_NOT_PENDING')
  })

  it('records a delivery failure honestly instead of pretending the code was sent', async () => {
    sent.ok = false
    try {
      const r = await requestUnlock(student, { idempotencyKey: key('u'), action: 'OPEN_APPS', reason: 'Provider is down', requestedMinutes: 5 })
      expect(r.deliveryFailed).toBe(true)
      expect(r.deliveryChannel).toBeNull()
      await expectApiError(redeemCode(student, r.id, '123456'), 'UNLOCK_NO_CODE')
    } finally {
      sent.ok = true
    }
  })
})
