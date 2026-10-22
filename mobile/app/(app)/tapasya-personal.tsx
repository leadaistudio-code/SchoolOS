import React from 'react'
import { Alert, AppState, View } from 'react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { ScreenHeader, SectionTitle } from '@/components/header'
import { Badge, Button, Card, Screen, SkeletonList, Txt } from '@/components/ui'
import { useAuth } from '@/auth/store'
import { colors, radius, spacing } from '@/theme'
import { advance, apply, EngineError, formatClock, initialState, isTerminal, view, type EngineEvent, type EngineState, type PomodoroSettings, type TimerView } from '@/tapasya/engine'
import { RESTRICTION_EXPLANATION, RESTRICTION_LABEL } from '@/tapasya/device'
import { engage, getDeviceStatus, release, runSetupStep, sessionCapMs, type DeviceStatus, type Engagement } from '@/tapasya/device-control'

/**
 * A parent's own focus session.
 *
 * Runs entirely on the phone: there is no server session, no XP and no
 * leaderboard entry, because those belong to students. The session is kept in
 * secure storage so that Do Not Disturb is always switched back off, even if
 * the app was closed mid-session.
 */

const STORE_KEY = 'mcv.tapasya.personal'

type Preset = { key: string; label: string; focus: number; rest: number; cycles: number }

const PRESETS: Preset[] = [
  { key: 'classic', label: 'Classic · 25 / 5 × 4', focus: 25, rest: 5, cycles: 4 },
  { key: 'deep', label: 'Deep work · 50 / 10 × 2', focus: 50, rest: 10, cycles: 2 },
  { key: 'short', label: 'Short · 15 / 3 × 4', focus: 15, rest: 3, cycles: 4 },
]

function settingsFor(p: Preset): PomodoroSettings {
  return {
    focusMinutes: p.focus,
    shortBreakMinutes: p.rest,
    longBreakMinutes: p.cycles >= 4 ? 15 : null,
    cyclesBeforeLongBreak: 4,
    plannedCycles: p.cycles,
    autoStartBreak: true,
    autoStartFocus: false,
    allowPause: true,
    allowSkipBreak: true,
    maxPauseMinutes: 15,
    idleExpiryMinutes: 60,
  }
}

type Stored = { settings: PomodoroSettings; engine: EngineState; engagement: Engagement }

async function load(): Promise<Stored | null> {
  const raw = await SecureStore.getItemAsync(STORE_KEY).catch(() => null)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Stored
  } catch {
    return null
  }
}

async function save(s: Stored | null): Promise<void> {
  if (s) await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(s)).catch(() => undefined)
  else await SecureStore.deleteItemAsync(STORE_KEY).catch(() => undefined)
}

export default function TapasyaPersonalScreen() {
  const brand = useAuth((s) => s.session?.primaryHex) || colors.brand
  const [loaded, setLoaded] = React.useState(false)
  const [session, setSession] = React.useState<Stored | null>(null)
  const [device, setDevice] = React.useState<DeviceStatus | null>(null)
  const [preset, setPreset] = React.useState<Preset>(PRESETS[0]!)
  const [busy, setBusy] = React.useState(false)
  const [summary, setSummary] = React.useState<{ state: string; cycles: number; planned: number; minutes: number } | null>(null)

  const checkDevice = React.useCallback(async () => {
    setDevice(await getDeviceStatus())
  }, [])

  React.useEffect(() => {
    void (async () => {
      setSession(await load())
      await checkDevice()
      setLoaded(true)
    })()
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void checkDevice() })
    return () => sub.remove()
  }, [checkDevice])

  const finish = React.useCallback(async (s: Stored) => {
    await release(s.engagement)
    await save(null)
    setSession(null)
    setSummary({
      state: s.engine.state,
      cycles: s.engine.completedCycles,
      planned: s.settings.plannedCycles,
      minutes: Math.floor(s.engine.totalFocusMs / 60_000),
    })
  }, [])

  async function start() {
    setBusy(true)
    setSummary(null)
    try {
      const settings = settingsFor(preset)
      const engagement = await engage({ untilMs: Date.now() + sessionCapMs(settings.plannedCycles, settings.focusMinutes, settings.longBreakMinutes ?? settings.shortBreakMinutes) })
      const now = Date.now()
      const { state } = apply(settings, initialState(now), { type: 'START_FOCUS' }, now)
      const next = { settings, engine: state, engagement }
      await save(next)
      setSession(next)
    } finally {
      setBusy(false)
    }
  }

  async function send(event: EngineEvent) {
    if (!session) return
    try {
      const { state } = apply(session.settings, session.engine, event, Date.now())
      const next = { ...session, engine: state }
      if (isTerminal(state.state)) {
        await finish(next)
        return
      }
      await save(next)
      setSession(next)
    } catch (err) {
      Alert.alert('Not possible right now', err instanceof EngineError ? err.message : 'Please try again.')
    }
  }

  const header = <ScreenHeader title="My focus session" subtitle="Tapasya Mode for parents" tint={brand} onBack={() => router.back()} />

  if (!loaded) {
    return <Screen padded={false} header={header}><View style={{ padding: spacing.base }}><SkeletonList rows={3} /></View></Screen>
  }

  return (
    <Screen scroll padded={false} header={header}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
        {session ? (
          <Running session={session} onSend={send} onTick={async (next) => {
            if (isTerminal(next.engine.state)) await finish(next)
            else { await save(next); setSession(next) }
          }} />
        ) : (
          <>
            {summary ? (
              <Card>
                <Txt variant="h2">{summary.state === 'COMPLETED' ? 'Session complete' : 'Session ended'}</Txt>
                <Txt variant="metric" style={{ marginTop: spacing.sm }}>{summary.cycles} of {summary.planned} cycles</Txt>
                <Txt variant="small" color={colors.textMuted}>{summary.minutes} focused minutes. Focus controls have been switched off.</Txt>
              </Card>
            ) : null}

            <SectionTitle tint={brand}>Choose a rhythm</SectionTitle>
            <Card style={{ gap: spacing.sm }}>
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  label={p.label}
                  variant={p.key === preset.key ? 'primary' : 'secondary'}
                  onPress={() => setPreset(p)}
                />
              ))}
            </Card>

            <Button label="Start focusing" onPress={() => void start()} loading={busy} style={{ marginTop: spacing.md }} />

            <SectionTitle tint={brand}>During the session</SectionTitle>
            {device ? (
              <Card>
                <Badge label={`This phone: ${RESTRICTION_LABEL[device.bestLevel]}`} tone={device.bestLevel === 'TIMER_ONLY' ? 'warning' : 'success'} />
                <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>{RESTRICTION_EXPLANATION[device.bestLevel]}</Txt>
                {device.setup.map((step, i) => (
                  <View key={i} style={{ marginTop: spacing.sm }}>
                    <Txt variant="small">{step.label}</Txt>
                    {step.kind !== 'INFO' ? <Button label="Allow" variant="secondary" onPress={() => void runSetupStep(step).then(checkDevice)} style={{ marginTop: spacing.xs }} /> : null}
                  </View>
                ))}
              </Card>
            ) : null}
            <Txt variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>
              This session is just for you. It is not shared with the school and earns no XP. Emergency calls always remain available.
            </Txt>
          </>
        )}
      </View>
    </Screen>
  )
}

function Running({
  session,
  onSend,
  onTick,
}: {
  session: Stored
  onSend: (e: EngineEvent) => Promise<void>
  onTick: (next: Stored) => Promise<void>
}) {
  const [timer, setTimer] = React.useState<TimerView>(() => view(session.settings, session.engine, Date.now()))
  const latest = React.useRef(session)
  latest.current = session

  React.useEffect(() => {
    const tick = () => {
      const s = latest.current
      const now = Date.now()
      const advanced = advance(s.settings, s.engine, now).state
      setTimer(view(s.settings, advanced, now))
      if (advanced.state !== s.engine.state || advanced.currentCycle !== s.engine.currentCycle) {
        void onTick({ ...s, engine: advanced })
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') tick() })
    return () => { clearInterval(id); sub.remove() }
  }, [onTick])

  const s = session.settings
  const level = session.engagement.level
  const phaseLabel = timer.phase === 'BREAK' ? (timer.longBreak ? 'Long break' : 'Break') : timer.phase === 'FOCUS' ? 'Focus' : 'Ready'

  return (
    <View>
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Badge label={phaseLabel} tone={timer.phase === 'BREAK' ? 'success' : 'info'} />
          <Badge label={`Cycle ${timer.cycle} of ${timer.plannedCycles}`} />
          {timer.state === 'FOCUS_PAUSED' ? <Badge label="Paused" tone="warning" /> : null}
        </View>
        <Txt style={{ fontSize: 64, lineHeight: 72, fontWeight: '700', textAlign: 'center', marginVertical: spacing.lg, fontVariant: ['tabular-nums'] }}>
          {timer.phase === 'IDLE' ? '--:--' : formatClock(timer.remainingMs)}
        </Txt>
        <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden', marginBottom: spacing.lg }}>
          <View style={{ width: `${Math.round(timer.progress * 100)}%`, height: '100%', backgroundColor: timer.phase === 'BREAK' ? colors.success : colors.brand }} />
        </View>
        <View style={{ gap: spacing.sm }}>
          {timer.state === 'FOCUS_ACTIVE' && s.allowPause ? <Button label="Pause" variant="secondary" onPress={() => void onSend({ type: 'PAUSE' })} /> : null}
          {timer.state === 'FOCUS_PAUSED' ? <Button label="Resume" onPress={() => void onSend({ type: 'RESUME' })} /> : null}
          {timer.state === 'READY' && timer.nextPhase === 'BREAK' ? <Button label="Start break" onPress={() => void onSend({ type: 'START_BREAK' })} /> : null}
          {timer.state === 'READY' && timer.nextPhase === 'FOCUS' ? <Button label="Start focus" onPress={() => void onSend({ type: 'START_FOCUS' })} /> : null}
          {(timer.state === 'BREAK_ACTIVE' || (timer.state === 'READY' && timer.nextPhase === 'BREAK')) && s.allowSkipBreak ? <Button label="Skip break" variant="secondary" onPress={() => void onSend({ type: 'SKIP_BREAK' })} /> : null}
          <Button
            label="End session"
            variant="ghost"
            onPress={() => Alert.alert('End this session?', 'Focus controls will be switched off.', [{ text: 'Keep going', style: 'cancel' }, { text: 'End', style: 'destructive', onPress: () => void onSend({ type: 'FINISH' }) }])}
          />
        </View>
      </Card>

      <Card>
        <Txt variant="bodyStrong">{RESTRICTION_LABEL[level]}</Txt>
        <Txt variant="small" color={colors.textMuted}>{RESTRICTION_EXPLANATION[level]}</Txt>
        {session.engagement.failures.length ? (
          <Txt variant="caption" color={colors.warning} style={{ marginTop: spacing.xs }}>{session.engagement.failures.join(' ')}</Txt>
        ) : null}
      </Card>
    </View>
  )
}
