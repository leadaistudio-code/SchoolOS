import React from 'react'
import { Alert, AppState, Platform, Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { ScreenHeader, SectionTitle } from '@/components/header'
import { Badge, Button, Card, ErrorState, Field, Input, Screen, SkeletonList, Txt } from '@/components/ui'
import { api, ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { colors, radius, spacing, type } from '@/theme'
import { apply, EngineError, formatClock, isTerminal, view, type EngineEvent, type TimerView } from '@/tapasya/engine'
import { RESTRICTION_EXPLANATION, RESTRICTION_LABEL, type RestrictionLevel } from '@/tapasya/device'
import { appBlockerState, engage, installationId, release, releaseOrphaned, screenPinned, sessionCapMs, type Engagement } from '@/tapasya/device-control'
import {
  clientKey,
  sendSessionEvent,
  useActiveSession,
  usePresets,
  useRedeemCode,
  useRequestUnlock,
  useStartSession,
  useTapasyaDashboard,
  useUnlocks,
  type EventType,
  type Preset,
  type Session,
} from '@/tapasya/api'

/**
 * The focus room: choose a preset, run the session, ask a guardian for an
 * exception. The timer is reconstructed from server timestamps every second,
 * so closing the app or locking the screen never loses or stretches time.
 */
export default function TapasyaFocusScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const active = useActiveSession()
  const header = <ScreenHeader title="Focus Room" tint={brand} onBack={() => router.back()} />

  if (active.isLoading) return <Screen padded={false} header={header}><View style={{ padding: spacing.base }}><SkeletonList rows={3} /></View></Screen>
  if (active.error) return <Screen padded={false} header={header}><ErrorState message={active.error instanceof ApiError ? active.error.message : 'Could not load.'} onRetry={active.refetch} /></Screen>

  return (
    <Screen scroll padded={false} header={header}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        {active.data && !isTerminal(active.data.engine.state) ? (
          <ActiveSession key={active.data.id} initial={active.data} onClosed={() => void active.refetch()} />
        ) : (
          <Setup onStarted={() => void active.refetch()} />
        )}
      </View>
    </Screen>
  )
}

function Chip({ label, active, onPress, disabled }: { label: string; active: boolean; onPress: () => void; disabled?: boolean }) {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={{
        paddingHorizontal: spacing.md,
        minHeight: 40,
        justifyContent: 'center',
        borderRadius: radius.base,
        borderWidth: 1,
        borderColor: active ? brand : colors.border,
        backgroundColor: active ? brand : colors.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Txt variant="small" color={active ? colors.textOnDark : colors.text}>{label}</Txt>
    </Pressable>
  )
}

function Setup({ onStarted }: { onStarted: () => void }) {
  const params = useLocalSearchParams<{ task?: string }>()
  const presets = usePresets()
  const dashboard = useTapasyaDashboard()
  const start = useStartSession()
  const [ref, setRef] = React.useState<string | null>(null)
  const [cycles, setCycles] = React.useState(4)
  const [taskId, setTaskId] = React.useState<string | null>(params.task ?? null)
  const [starting, setStarting] = React.useState(false)

  const all: Preset[] = [...(presets.data?.personal ?? []), ...(presets.data?.builtins ?? [])]
  const usable = all.filter((p) => p.issues.length === 0)
  React.useEffect(() => {
    if (!ref && usable[0]) setRef(usable[0].ref)
  }, [ref, usable])

  const tasks = dashboard.data?.today.open ?? []
  const task = tasks.find((t) => t.id === taskId)
  const maxCycles = presets.data?.limits.maxCyclesPerSession ?? 12

  async function begin() {
    if (!ref) return
    setStarting(true)
    let engagement: Engagement | null = null
    try {
      const chosen = all.find((p) => p.ref === ref)
      const focusMinutes = Math.max(chosen?.focusMinutes ?? 25, task?.requiredFocusMinutes ?? 0)
      const breakMinutes = Math.max(chosen?.shortBreakMinutes ?? 5, chosen?.longBreakMinutes ?? 0)
      engagement = await engage({ untilMs: Date.now() + sessionCapMs(cycles, focusMinutes, breakMinutes) })
      const out = await start.mutateAsync({
        clientSessionKey: clientKey('session'),
        presetRef: ref,
        plannedCycles: cycles,
        taskId,
        deviceId: await installationId(),
        restriction: { level: engagement.level, detail: { applied: engagement.applied, failures: engagement.failures } },
      })
      sessionEngagement = engagement
      if (out.notes.length) Alert.alert('Session settings', out.notes.join('\n'))
      if (engagement.failures.length) Alert.alert(RESTRICTION_LABEL[engagement.level], engagement.failures.join('\n'))
      onStarted()
    } catch (err) {
      if (engagement) await release(engagement)
      Alert.alert('Session not started', err instanceof ApiError ? (err.isOffline ? 'You need a connection to start a session. Once started, it keeps running through a dropped connection.' : err.message) : 'Please try again.')
    } finally {
      setStarting(false)
    }
  }

  if (presets.isLoading) return <SkeletonList rows={3} />
  if (presets.error) return <ErrorState message={presets.error instanceof ApiError ? presets.error.message : 'Could not load presets.'} onRetry={presets.refetch} />

  return (
    <View>
      <SectionTitle>Timer</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {all.map((p) => (
          <Chip key={p.ref} label={`${p.name} · ${p.focusMinutes}/${p.shortBreakMinutes}`} active={ref === p.ref} disabled={p.issues.length > 0} onPress={() => setRef(p.ref)} />
        ))}
      </View>
      {all.some((p) => p.issues.length) ? <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>Greyed-out presets are outside your school’s limits. Edit them on the web.</Txt> : null}
      {task?.requiredFocusMinutes ? <Txt variant="small" color={colors.info} style={{ marginTop: spacing.sm }}>Your teacher set {task.requiredFocusMinutes}-minute focus intervals for this task; they replace the preset’s timings.</Txt> : null}

      <SectionTitle>Cycles</SectionTitle>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Button label="−" variant="secondary" onPress={() => setCycles((c) => Math.max(1, c - 1))} style={{ width: 56 }} />
        <Txt variant="metric">{cycles}</Txt>
        <Button label="+" variant="secondary" onPress={() => setCycles((c) => Math.min(maxCycles, c + 1))} style={{ width: 56 }} />
      </View>

      <SectionTitle>Task</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Chip label="Just focus" active={!taskId} onPress={() => setTaskId(null)} />
        {tasks.map((t) => <Chip key={t.id} label={`${t.isPrimaryFrog ? '★ ' : ''}${t.title}`} active={taskId === t.id} onPress={() => setTaskId(t.id)} />)}
      </View>

      <Card style={{ marginTop: spacing.lg }}>
        <Txt variant="small" color={colors.textMuted}>When you start, MyCampusView blocks other apps if you have set up Phone controls, may ask Android to pin the app, and shows exactly which controls are active. Calls always stay available. Restriction level never changes your XP.</Txt>
      </Card>
      <Button label="Start session" onPress={() => void begin()} loading={starting} disabled={!ref} style={{ marginTop: spacing.md }} />
      <Button label="Phone controls" variant="ghost" onPress={() => router.push('/(app)/tapasya-device')} />
    </View>
  )
}

/** Survives remounts of the screen within one app run; the OS state itself is the source of truth. */
let sessionEngagement: Engagement | null = null

type Queued = { clientEventId: string; type: EventType; clientAt: string; offline: true }

function ActiveSession({ initial, onClosed }: { initial: Session; onClosed: () => void }) {
  const qc = useQueryClient()
  const [session, setSession] = React.useState(initial)
  const offset = React.useRef(initial.serverNow - Date.now())
  const [timer, setTimer] = React.useState<TimerView>(() => view(initial.settings, initial.engine, Date.now() + offset.current))
  const [busy, setBusy] = React.useState<string | null>(null)
  const [level, setLevel] = React.useState<RestrictionLevel>(initial.restrictionLevel)
  const queue = React.useRef<Queued[]>([])
  const [pendingSync, setPendingSync] = React.useState(false)
  const lastSync = React.useRef(0)
  const flushing = React.useRef(false)

  const adopt = React.useCallback((s: Session) => {
    offset.current = s.serverNow - Date.now()
    setSession(s)
  }, [])

  const flush = React.useCallback(async () => {
    if (flushing.current || !queue.current.length) return
    flushing.current = true
    try {
      const events = queue.current.slice()
      const out = await api.post<{ session: Session }>(`/tapasya/sessions/${session.id}/events`, { events })
      queue.current = queue.current.slice(events.length)
      setPendingSync(queue.current.length > 0)
      adopt(out.data.session)
    } catch {
      // Still offline: the queue is kept and retried.
    } finally {
      flushing.current = false
    }
  }, [session.id, adopt])

  const send = React.useCallback(async (type: EventType, restriction?: { level: RestrictionLevel; detail?: Record<string, unknown> }) => {
    setBusy(type)
    try {
      if (queue.current.length) await flush()
      adopt(await sendSessionEvent(session.id, type, restriction))
    } catch (err) {
      if (err instanceof ApiError && err.isOffline && type !== 'SYNC') {
        const now = Date.now() + offset.current
        try {
          const local = apply(session.settings, session.engine, { type } as EngineEvent, now)
          queue.current.push({ clientEventId: clientKey(type.toLowerCase()), type, clientAt: new Date(now).toISOString(), offline: true })
          setPendingSync(true)
          setSession({ ...session, engine: local.state })
        } catch (e) {
          if (e instanceof EngineError) Alert.alert('Not possible right now', e.message)
        }
      } else if (type !== 'SYNC') {
        Alert.alert('Not possible right now', err instanceof ApiError ? err.message : 'Please try again.')
      }
    } finally {
      setBusy(null)
    }
  }, [session, adopt, flush])

  React.useEffect(() => {
    const tick = () => {
      const v = view(session.settings, session.engine, Date.now() + offset.current)
      setTimer(v)
      if (v.state !== session.engine.state && !isTerminal(session.engine.state) && Date.now() - lastSync.current > 5000) {
        lastSync.current = Date.now()
        void send('SYNC')
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { tick(); void flush() } })
    const retry = setInterval(() => void flush(), 15_000)
    return () => { clearInterval(id); clearInterval(retry); sub.remove() }
  }, [session, send, flush])

  const ended = isTerminal(session.engine.state)
  React.useEffect(() => {
    if (!ended) return
    if (sessionEngagement) {
      void release(sessionEngagement)
      sessionEngagement = null
    } else {
      void releaseOrphaned()
    }
    void qc.invalidateQueries({ queryKey: ['tapasya'] })
  }, [ended, qc])

  // If the student revokes the blocker's permissions or unpins, say so and report it.
  const [blocked, setBlocked] = React.useState(0)
  React.useEffect(() => {
    if (ended || level !== 'APP_SHIELDING' || Platform.OS !== 'android') return
    const check = () => {
      const blocker = appBlockerState()
      setBlocked(blocker?.blockedCount ?? 0)
      const blocking = (!!blocker?.running && !blocker.lostAccess) || screenPinned()
      if (!blocking) {
        setLevel('TIMER_ONLY')
        void send('SYNC', { level: 'TIMER_ONLY', detail: { reason: blocker?.lostAccess ? 'blocker-permission-revoked' : 'app-blocking-stopped' } })
      }
    }
    const id = setInterval(check, 10_000)
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check() })
    return () => { clearInterval(id); sub.remove() }
  }, [ended, level, send])

  const s = session.settings
  if (ended) {
    return (
      <Card>
        <Txt variant="h2">{session.engine.state === 'COMPLETED' ? 'Session complete' : session.engine.state === 'CANCELLED' ? 'Session cancelled' : 'Session ended'}</Txt>
        <Txt variant="metric" style={{ marginTop: spacing.sm }}>{session.completedCycles} of {session.plannedCycles} cycles</Txt>
        <Txt variant="small" color={colors.textMuted}>{Math.floor(session.engine.totalFocusMs / 60_000)} focused minutes. XP for this session is on your Tapasya home.</Txt>
        <Button label="Done" onPress={onClosed} style={{ marginTop: spacing.lg }} />
      </Card>
    )
  }

  const phaseLabel = timer.phase === 'BREAK' ? (timer.longBreak ? 'Long break' : 'Break') : timer.phase === 'FOCUS' ? 'Focus' : 'Ready'
  return (
    <View>
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Badge label={phaseLabel} tone={timer.phase === 'BREAK' ? 'success' : 'info'} />
          <Badge label={`Cycle ${timer.cycle} of ${timer.plannedCycles}`} />
          {timer.state === 'FOCUS_PAUSED' ? <Badge label="Paused" tone="warning" /> : null}
          {pendingSync ? <Badge label="Waiting to sync" tone="warning" /> : null}
        </View>
        {session.task ? <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>{session.task.title}</Txt> : null}
        <Txt style={{ fontSize: 64, lineHeight: 72, fontWeight: '700', textAlign: 'center', marginVertical: spacing.lg, fontVariant: ['tabular-nums'] }}>
          {timer.phase === 'IDLE' ? '--:--' : formatClock(timer.remainingMs)}
        </Txt>
        <View style={{ gap: spacing.sm }}>
          {timer.state === 'FOCUS_ACTIVE' && s.allowPause ? <Button label="Pause" variant="secondary" onPress={() => void send('PAUSE')} loading={busy === 'PAUSE'} /> : null}
          {timer.state === 'FOCUS_PAUSED' ? <Button label="Resume" onPress={() => void send('RESUME')} loading={busy === 'RESUME'} /> : null}
          {timer.state === 'READY' && timer.nextPhase === 'BREAK' ? <Button label="Start break" onPress={() => void send('START_BREAK')} loading={busy === 'START_BREAK'} /> : null}
          {timer.state === 'READY' && timer.nextPhase === 'FOCUS' ? <Button label="Start focus" onPress={() => void send('START_FOCUS')} loading={busy === 'START_FOCUS'} /> : null}
          {(timer.state === 'BREAK_ACTIVE' || (timer.state === 'READY' && timer.nextPhase === 'BREAK')) && s.allowSkipBreak ? <Button label="Skip break" variant="secondary" onPress={() => void send('SKIP_BREAK')} loading={busy === 'SKIP_BREAK'} /> : null}
          <Button
            label="End session"
            variant="ghost"
            onPress={() => Alert.alert('End this session?', 'A focus interval in progress will not count.', [{ text: 'Keep going', style: 'cancel' }, { text: 'End', style: 'destructive', onPress: () => void send('FINISH') }])}
          />
        </View>
        {timer.state === 'FOCUS_PAUSED' ? <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>A pause longer than {s.maxPauseMinutes} minutes ends this interval without XP.</Txt> : null}
        {timer.phase === 'BREAK' ? <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>Break time is for rest. It does not unlock other apps.</Txt> : null}
      </Card>

      <Card>
        <Txt variant="bodyStrong">{RESTRICTION_LABEL[level]}</Txt>
        <Txt variant="small" color={colors.textMuted}>{RESTRICTION_EXPLANATION[level]}</Txt>
        {blocked > 0 ? <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>Blocked {blocked} attempt{blocked === 1 ? '' : 's'} to open another app this session.</Txt> : null}
        {level === 'TIMER_ONLY' || level === 'PARTIAL' ? <Button label="Set up app blocking" variant="ghost" onPress={() => router.push('/(app)/tapasya-device')} /> : null}
      </Card>

      <UnlockPanel session={session} onGrant={async (granted) => {
        if (granted && sessionEngagement && sessionEngagement.applied.length) {
          sessionEngagement = await release(sessionEngagement, { keepManaged: true })
          setLevel(sessionEngagement.level)
          await send('SYNC', { level: sessionEngagement.level, detail: { reason: 'guardian-approved exception' } })
        }
      }} />
    </View>
  )
}

const ACTIONS = [
  { key: 'OPEN_APPS', label: 'Use another app' },
  { key: 'BREAK_APPS', label: 'Use apps in my break' },
  { key: 'END_SESSION', label: 'End early' },
] as const

function UnlockPanel({ session, onGrant }: { session: Session; onGrant: (granted: boolean) => Promise<void> }) {
  const unlocks = useUnlocks()
  const request = useRequestUnlock()
  const redeem = useRedeemCode()
  const [open, setOpen] = React.useState(false)
  const [action, setAction] = React.useState<(typeof ACTIONS)[number]['key']>('OPEN_APPS')
  const [minutes, setMinutes] = React.useState('10')
  const [reason, setReason] = React.useState('')
  const [code, setCode] = React.useState('')
  const idem = React.useRef(clientKey('unlock'))
  const handled = React.useRef<string | null>(null)

  const pending = unlocks.data?.items.find((u) => (u.status === 'PENDING' || u.status === 'DELIVERY_FAILED') && new Date(u.expiresAt).getTime() > Date.now())
  const grant = unlocks.data?.activeGrant ?? null

  React.useEffect(() => {
    if (!pending) return
    const id = setInterval(() => void unlocks.refetch(), 10_000)
    return () => clearInterval(id)
  }, [pending, unlocks])

  React.useEffect(() => {
    if (grant && handled.current !== grant.id) {
      handled.current = grant.id
      void onGrant(true)
    }
  }, [grant, onGrant])

  async function submit() {
    try {
      await request.mutateAsync({ idempotencyKey: idem.current, action, reason: reason.trim(), requestedMinutes: Number(minutes) || 10, sessionId: session.id, deviceId: await installationId() })
      idem.current = clientKey('unlock')
      setOpen(false)
      setReason('')
    } catch (err) {
      Alert.alert('Request not sent', err instanceof ApiError ? err.message : 'Please try again.')
    }
  }

  async function enterCode() {
    if (!pending) return
    try {
      const out = await redeem.mutateAsync({ id: pending.id, code: code.trim() })
      setCode('')
      if (out.status === 'APPROVED') Alert.alert('Approved', `Allowed until ${out.grantEndsAt ? new Date(out.grantEndsAt).toLocaleTimeString() : 'the time your guardian set'}.`)
    } catch (err) {
      Alert.alert('Code not accepted', err instanceof ApiError ? err.message : 'Please try again.')
    }
  }

  if (grant) {
    return (
      <Card>
        <Txt variant="bodyStrong">Exception approved</Txt>
        <Txt variant="small" color={colors.textMuted}>Until {grant.grantEndsAt ? new Date(grant.grantEndsAt).toLocaleTimeString() : '—'}. The app’s own restrictions are lifted; restrictions set by your school’s device management stay.</Txt>
      </Card>
    )
  }

  if (pending) {
    return (
      <Card>
        <Txt variant="bodyStrong">Waiting for your guardian</Txt>
        <Txt variant="small" color={colors.textMuted}>
          {pending.deliveryFailed ? 'The message to your guardian could not be delivered. They can still approve in the MyCampusView app.' : 'Your guardian has been sent a 6-digit code on WhatsApp. Type it here, or they can approve in their app.'}
        </Txt>
        <Field label="Code" hint={`${pending.attemptsLeft} tries left · expires ${new Date(pending.expiresAt).toLocaleTimeString()}`}>
          <Input value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} style={{ fontSize: type.h2.fontSize, letterSpacing: 6 }} />
        </Field>
        <Button label="Enter code" onPress={() => void enterCode()} loading={redeem.isPending} disabled={code.trim().length !== 6} />
      </Card>
    )
  }

  if (!open) return <Button label="Ask my guardian for an exception" variant="ghost" onPress={() => setOpen(true)} />

  return (
    <Card>
      <Txt variant="bodyStrong">Ask for an exception</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.md }}>
        {ACTIONS.map((a) => <Chip key={a.key} label={a.label} active={action === a.key} onPress={() => setAction(a.key)} />)}
      </View>
      <Field label="Minutes"><Input value={minutes} onChangeText={setMinutes} keyboardType="number-pad" maxLength={3} /></Field>
      <Field label="Why?"><Input value={reason} onChangeText={setReason} maxLength={300} multiline style={{ minHeight: 72, textAlignVertical: 'top' }} /></Field>
      <Button label="Send request" onPress={() => void submit()} loading={request.isPending} disabled={reason.trim().length < 3} />
      <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
    </Card>
  )
}
