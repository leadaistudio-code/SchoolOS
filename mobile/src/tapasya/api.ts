import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { EngineState, PomodoroSettings } from './engine'
import type { RestrictionLevel } from './device'

/**
 * Tapasya Mode's typed surface on the phone. Shapes mirror the server DTOs in
 * src/server/modules/tapasya; only the fields the phone reads are declared.
 */

export type TapasyaTask = {
  id: string
  title: string
  subject: string | null
  estimatedMinutes: number
  actualMinutes: number
  dueOn: string | null
  status: string
  isTeacherAssigned: boolean
  isMandatory: boolean
  teacherInstructions: string | null
  requiredFocusMinutes: number | null
  frogOn: string | null
  isPrimaryFrog: boolean
}

export type Session = {
  id: string
  state: string
  settings: PomodoroSettings
  engine: EngineState
  policySource: string
  task: { id: string; title: string } | null
  plannedCycles: number
  completedCycles: number
  totalFocusMinutes: number
  restrictionLevel: RestrictionLevel
  offlineSynced: boolean
  startedAt: string
  serverNow: number
}

export type XpSummary = {
  totalXp: number
  todayXp: number
  weekXp: number
  pendingXp: number
  streakDays: number
  focusMinutes: number
  completedIntervals: number
  caps: { daily: number; weekly: number }
  level: { level: number; nextLevelXp: number; progress: number }
  achievements: { key: string; title: string; description: string; awardedAt: string | null }[]
}

export type TapasyaDashboard = {
  summary: XpSummary
  today: { today: string; primaryFrog: TapasyaTask | null; frogs: TapasyaTask[]; open: TapasyaTask[] }
  activeSession: Session | null
  policy: { enabled: boolean; globalLeaderboardAllowed: boolean }
  globalProfile: { alias: string; avatarKey: string; status: string } | null
}

export type Preset = {
  ref: string
  id: string | null
  name: string
  description: string | null
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number | null
  cyclesBeforeLongBreak: number
  issues: { field: string; message: string }[]
}

export type PresetList = { builtins: Preset[]; personal: Preset[]; limits: { maxCyclesPerSession: number; allowPause: boolean; allowSkipBreak: boolean } }

export type HistoryItem = {
  id: string
  state: string
  startedAt: string
  completedCycles: number
  plannedCycles: number
  focusMinutes: number
  task: { title: string } | null
  xp: { validated: number; pending: number; rejected: { reason: string | null }[] }
}

export type Unlock = {
  id: string
  action: string
  reason: string
  requestedMinutes: number
  status: string
  expiresAt: string
  attemptsLeft: number
  deliveryFailed: boolean
  grantEndsAt: string | null
}

export type BoardRow = { rank: number; alias: string; avatarKey: string; xp: number; badges: string[]; movement: number | null; isYou: boolean }
export type Board = { period: string; periodKey: string | null; rows: BoardRow[]; total: number; you: (BoardRow & { status: string }) | null }

export type GuardianChild = {
  studentId: string
  name: string
  summary: XpSummary | null
  primaryFrog: TapasyaTask | null
  openTasks: number
  leaderboard: { alias: string; status: string } | null
  recentSessions: HistoryItem[]
}
export type GuardianUnlock = Unlock & { studentId: string; studentName: string; createdAt: string }

export type EventType = 'START_FOCUS' | 'PAUSE' | 'RESUME' | 'START_BREAK' | 'SKIP_BREAK' | 'FINISH' | 'CANCEL' | 'INTERRUPT' | 'SYNC'
export type RestrictionReport = { level: RestrictionLevel; detail?: Record<string, unknown> }

export function clientKey(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const KEY = ['tapasya'] as const

export function useTapasyaDashboard() {
  return useQuery({ queryKey: [...KEY, 'dashboard'], queryFn: () => api.get<TapasyaDashboard>('/tapasya/dashboard').then((r) => r.data) })
}

export function usePresets() {
  return useQuery({ queryKey: [...KEY, 'presets'], queryFn: () => api.get<PresetList>('/tapasya/presets').then((r) => r.data) })
}

export function useActiveSession() {
  return useQuery({ queryKey: [...KEY, 'active'], queryFn: () => api.get<Session | null>('/tapasya/sessions/active').then((r) => r.data) })
}

export function useSessionHistory() {
  return useQuery({ queryKey: [...KEY, 'history'], queryFn: () => api.get<HistoryItem[]>('/tapasya/sessions', { page: 1, pageSize: 20 }).then((r) => r.data) })
}

export function useTasks() {
  return useQuery({ queryKey: [...KEY, 'tasks'], queryFn: () => api.get<TapasyaTask[]>('/tapasya/tasks').then((r) => r.data) })
}

export function useLeaderboard(period: string) {
  return useQuery({ queryKey: [...KEY, 'board', period], queryFn: () => api.get<Board>('/tapasya/leaderboard', { period, pageSize: 50 }).then((r) => r.data) })
}

export function useUnlocks() {
  return useQuery({ queryKey: [...KEY, 'unlocks'], queryFn: () => api.get<{ items: Unlock[]; activeGrant: Unlock | null }>('/tapasya/unlock').then((r) => r.data) })
}

export function useGuardianOverview(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'guardian'],
    enabled,
    queryFn: () => api.get<{ children: GuardianChild[]; unlocks: GuardianUnlock[] }>('/tapasya/guardian').then((r) => r.data),
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: KEY })
}

export function useStartSession() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { clientSessionKey: string; presetRef: string; plannedCycles: number; taskId?: string | null; deviceId?: string | null; restriction?: RestrictionReport }) =>
      api.post<{ session: Session; notes: string[] }>('/tapasya/sessions', body).then((r) => r.data),
    onSuccess: invalidate,
  })
}

/** Not invalidating on every tick: the caller keeps the returned session. */
export async function sendSessionEvent(sessionId: string, type: EventType, restriction?: RestrictionReport): Promise<Session> {
  const out = await api.post<{ session: Session }>(`/tapasya/sessions/${sessionId}/events`, {
    events: [{ clientEventId: clientKey(type.toLowerCase()), type, ...(restriction ? { restriction } : {}) }],
  })
  return out.data.session
}

export function useTaskUpdate() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: string }) => api.patch(`/tapasya/tasks/${id}`, body),
    onSuccess: invalidate,
  })
}

export function useCreateTask() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { title: string; subject?: string | null; estimatedMinutes: number }) => api.post('/tapasya/tasks', { category: 'PERSONAL', ...body }),
    onSuccess: invalidate,
  })
}

export function useSetFrogs() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { taskIds: string[]; primaryTaskId: string | null }) => api.put('/tapasya/frogs', body),
    onSuccess: invalidate,
  })
}

export function useRequestUnlock() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { idempotencyKey: string; action: 'OPEN_APPS' | 'END_SESSION' | 'BREAK_APPS'; reason: string; requestedMinutes: number; sessionId?: string | null; deviceId?: string | null }) =>
      api.post<Unlock>('/tapasya/unlock', body).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useRedeemCode() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) => api.post<Unlock>(`/tapasya/unlock/${id}`, { code }).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useGuardianUnlockDecision() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVE' | 'REJECT' }) => api.post(`/tapasya/guardian/unlock/${id}`, { decision }),
    onSuccess: invalidate,
  })
}

export function useGuardianConsent() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { studentId: string; decision: 'APPROVE' | 'DECLINE' | 'WITHDRAW' }) => api.post('/tapasya/guardian/consent', body),
    onSuccess: invalidate,
  })
}

export function useReportDevice() {
  return useMutation({ mutationFn: (body: unknown) => api.post('/tapasya/devices', body) })
}
