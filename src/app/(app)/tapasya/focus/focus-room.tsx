'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, Pause, Play, Square, SkipForward, Coffee, Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { Progress } from '@/components/ui/progress'
import { buttonVariants } from '@/components/ui/button-variants'
import { useToast } from '@/components/ui/toast'
import { formatClock, isTerminal, view, type TimerView } from '@/lib/tapasya/engine'
import { validatePreset, type EffectiveLimits, type PresetFields } from '@/lib/tapasya/policy'
import { RESTRICTION_EXPLANATION, RESTRICTION_LABEL, type RestrictionLevel } from '@/lib/tapasya/device'
import type { PresetDto } from '@/server/modules/tapasya/presets'
import type { SessionDto, SessionHistoryItem } from '@/server/modules/tapasya/sessions'
import { api, clientKey } from '../_components/api'

type TaskOption = { id: string; title: string; requiredFocusMinutes: number | null; isMandatory: boolean; isPrimaryFrog: boolean }
type Presets = { builtins: PresetDto[]; personal: PresetDto[]; limits: EffectiveLimits }

export function FocusRoom(props: { presets: Presets; active: SessionDto | null; tasks: TaskOption[]; initialTaskId: string | null; enabled: boolean }) {
  const [session, setSession] = React.useState<SessionDto | null>(props.active)
  if (session) return <ActiveSession initial={session} onClosed={() => setSession(null)} />
  return <SessionSetup {...props} onStarted={setSession} />
}

// --- Setup ------------------------------------------------------------------

const BLANK: PresetFields = {
  name: 'My preset', focusMinutes: 30, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4,
  autoStartBreak: true, autoStartFocus: false, allowPause: true, allowSkipBreak: true, soundEnabled: true, hapticsEnabled: true,
}

function SessionSetup({ presets, tasks, initialTaskId, enabled, onStarted }: { presets: Presets; tasks: TaskOption[]; initialTaskId: string | null; enabled: boolean; onStarted: (s: SessionDto) => void }) {
  const router = useRouter()
  const { push } = useToast()
  const all = [...presets.personal, ...presets.builtins]
  const usable = all.filter((p) => p.issues.length === 0)
  const [ref, setRef] = React.useState<string>((presets.personal.find((p) => p.isDefault && !p.issues.length) ?? usable[0])?.ref ?? '')
  const [cycles, setCycles] = React.useState(2)
  const [taskId, setTaskId] = React.useState<string>(initialTaskId ?? '')
  const [busy, setBusy] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<{ id: string | null; fields: PresetFields & { isDefault?: boolean } } | null>(null)

  const chosen = all.find((p) => p.ref === ref)
  const task = tasks.find((t) => t.id === taskId)
  const focusMinutes = task?.isMandatory && task.requiredFocusMinutes ? task.requiredFocusMinutes : chosen?.focusMinutes ?? 0
  const totalMinutes = chosen ? cycles * focusMinutes + Math.max(0, cycles - 1) * chosen.shortBreakMinutes : 0

  async function start() {
    if (!chosen) return
    setBusy('start')
    try {
      const out = await api<{ session: SessionDto; notes: string[] }>('/api/v1/tapasya/sessions', {
        method: 'POST',
        body: { clientSessionKey: clientKey('web'), presetRef: chosen.ref, plannedCycles: cycles, taskId: taskId || null, restriction: { level: 'TIMER_ONLY', detail: { platform: 'web' } } },
      })
      for (const note of out.notes) push({ tone: 'info', title: 'Session settings', description: note })
      onStarted(out.session)
    } catch (err) {
      push({ tone: 'error', title: 'Session not started', description: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function savePreset() {
    if (!editing) return
    const issues = validatePreset(editing.fields, presets.limits)
    if (issues.length) {
      push({ tone: 'error', title: 'Check the preset', description: issues[0]!.message })
      return
    }
    setBusy('save')
    try {
      const saved = await api<PresetDto>(editing.id ? `/api/v1/tapasya/presets/${editing.id}` : '/api/v1/tapasya/presets', { method: editing.id ? 'PUT' : 'POST', body: editing.fields })
      setEditing(null)
      setRef(saved.ref)
      push({ tone: 'success', title: 'Preset saved' })
      router.refresh()
    } catch (err) {
      push({ tone: 'error', title: 'Preset not saved', description: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function duplicate(p: PresetDto) {
    setBusy(`dup:${p.ref}`)
    try {
      const saved = await api<PresetDto>(`/api/v1/tapasya/presets/${encodeURIComponent(p.ref)}`, { method: 'POST' })
      setRef(saved.ref)
      push({ tone: 'success', title: 'Copied', description: `"${saved.name}" is now one of your presets.` })
      router.refresh()
    } catch (err) {
      push({ tone: 'error', title: 'Not copied', description: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function remove(p: PresetDto) {
    if (!window.confirm(`Delete "${p.name}"? Past sessions keep their settings.`)) return
    try {
      await api(`/api/v1/tapasya/presets/${p.id}`, { method: 'DELETE' })
      router.refresh()
    } catch (err) {
      push({ tone: 'error', title: 'Not deleted', description: (err as Error).message })
    }
  }

  const editIssues = editing ? validatePreset(editing.fields, presets.limits) : []
  const set = (patch: Partial<PresetFields & { isDefault?: boolean }>) => setEditing((e) => (e ? { ...e, fields: { ...e.fields, ...patch } } : e))

  return (
    <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.3fr_1fr]">
      <Section
        title="Choose a preset"
        description={`Your school allows ${presets.limits.minFocusMinutes}–${presets.limits.maxFocusMinutes} min focus and ${presets.limits.minBreakMinutes}–${presets.limits.maxBreakMinutes} min breaks.`}
        actions={<Button size="sm" variant="secondary" onClick={() => setEditing({ id: null, fields: { ...BLANK } })}><Plus aria-hidden /> New preset</Button>}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {all.map((p) => (
            <Card key={p.ref} className={p.ref === ref ? 'border-[var(--brand-500)]' : undefined}>
              <CardContent className="pt-4 pb-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="radio" name="preset" className="mt-1" disabled={p.issues.length > 0} checked={p.ref === ref} onChange={() => setRef(p.ref)} />
                  <span>
                    <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {p.name}
                      {p.builtinKey ? <Badge tone="neutral">Built-in</Badge> : null}
                      {p.isDefault ? <Badge tone="brand">Default</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-muted tnum">
                      {p.focusMinutes} min focus · {p.shortBreakMinutes} min break{p.longBreakMinutes ? ` · ${p.longBreakMinutes} min long break every ${p.cyclesBeforeLongBreak}` : ''}
                    </span>
                    {p.issues.length ? <span className="mt-1 block text-xs text-[var(--danger)]">Not allowed now: {p.issues[0]!.message}</span> : null}
                  </span>
                </label>
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => duplicate(p)} loading={busy === `dup:${p.ref}`}><Copy aria-hidden /> Duplicate</Button>
                  {p.id ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ id: p.id, fields: { ...p, isDefault: p.isDefault } })}><Pencil aria-hidden /> Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(p)}><Trash2 aria-hidden /> Delete</Button>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {editing ? (
          <Card className="mt-4">
            <CardContent className="pt-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3"><Field htmlFor="tf-name" label="Name"><Input id="tf-name" maxLength={40} value={editing.fields.name} onChange={(e) => set({ name: e.target.value })} /></Field></div>
                <Field htmlFor="tf-focus" label="Focus (min)"><Input id="tf-focus" type="number" value={editing.fields.focusMinutes} onChange={(e) => set({ focusMinutes: Number(e.target.value) })} /></Field>
                <Field htmlFor="tf-short-break" label="Short break (min)"><Input id="tf-short-break" type="number" value={editing.fields.shortBreakMinutes} onChange={(e) => set({ shortBreakMinutes: Number(e.target.value) })} /></Field>
                <Field htmlFor="tf-long-break" label="Long break (min)" hint="Blank for none"><Input id="tf-long-break" type="number" value={editing.fields.longBreakMinutes ?? ''} onChange={(e) => set({ longBreakMinutes: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                <Field htmlFor="tf-long-break-after" label="Long break after"><Input id="tf-long-break-after" type="number" value={editing.fields.cyclesBeforeLongBreak} onChange={(e) => set({ cyclesBeforeLongBreak: Number(e.target.value) })} /></Field>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {([
                  ['autoStartBreak', 'Start breaks automatically'],
                  ['autoStartFocus', 'Start the next focus automatically'],
                  ['allowPause', 'Allow pausing focus'],
                  ['allowSkipBreak', 'Allow skipping breaks'],
                  ['soundEnabled', 'Sound'],
                  ['hapticsEnabled', 'Vibration (mobile)'],
                  ['isDefault', 'Use as my default'],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-ink">
                    <Checkbox checked={Boolean(editing.fields[k])} onChange={(e) => set({ [k]: e.target.checked })} /> {label}
                  </label>
                ))}
              </div>
              {editIssues.length ? <Notice tone="warning" className="mt-3">{editIssues.map((i) => i.message).join(' ')}</Notice> : null}
              <div className="mt-4 flex gap-2">
                <Button onClick={savePreset} loading={busy === 'save'} disabled={editIssues.length > 0}>Save preset</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </Section>

      <Section title="Session">
        <Card>
          <CardContent className="pt-5">
            {!enabled ? <Notice tone="warning" className="mb-3">Tapasya Mode is switched off for your school.</Notice> : null}
            <div className="grid gap-3">
              <Field htmlFor="tf-task" label="Task (optional)">
                <Select id="tf-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">No task — just focus</option>
                  {tasks.map((t) => <option key={t.id} value={t.id}>{t.isPrimaryFrog ? '★ ' : ''}{t.title}</option>)}
                </Select>
              </Field>
              <Field htmlFor="tf-focus-cycles" label="Focus cycles" hint={`1 to ${presets.limits.maxCyclesPerSession}`}>
                <Input id="tf-focus-cycles" type="number" min={1} max={presets.limits.maxCyclesPerSession} value={cycles} onChange={(e) => setCycles(Math.max(1, Math.min(presets.limits.maxCyclesPerSession, Number(e.target.value) || 1)))} />
              </Field>
            </div>
            {task?.isMandatory && task.requiredFocusMinutes && chosen && task.requiredFocusMinutes !== chosen.focusMinutes ? (
              <Notice tone="info" className="mt-3">Your teacher set {task.requiredFocusMinutes}-minute focus for this task. Your preset stays as it is.</Notice>
            ) : null}
            <p className="mt-3 text-sm text-ink-muted tnum">{chosen ? `About ${totalMinutes} minutes in total.` : 'No preset is usable under the current policy.'}</p>
            <Notice tone="info" className="mt-3" title={RESTRICTION_LABEL.TIMER_ONLY}>
              In the browser only the timer runs; other apps and tabs are not blocked. App shielding and managed kiosk are available only in the MyCampusView mobile app on supported, authorised devices.
            </Notice>
            <Button className="mt-4" block onClick={start} disabled={!chosen || !enabled} loading={busy === 'start'}><Play aria-hidden /> Start focus</Button>
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}

// --- Active session ---------------------------------------------------------

const PHASE_LABEL: Record<string, string> = { FOCUS: 'Focus', BREAK: 'Break', IDLE: 'Ready', DONE: 'Finished' }

function ActiveSession({ initial, onClosed }: { initial: SessionDto; onClosed: () => void }) {
  const router = useRouter()
  const { push } = useToast()
  const [session, setSession] = React.useState(initial)
  const offset = React.useRef(initial.serverNow - Date.now())
  const [timer, setTimer] = React.useState<TimerView>(() => view(initial.settings, initial.engine, Date.now() + offset.current))
  const [busy, setBusy] = React.useState<string | null>(null)
  const [summary, setSummary] = React.useState<SessionHistoryItem | null>(null)
  const syncing = React.useRef(false)
  const lastSync = React.useRef(0)

  const send = React.useCallback(async (type: string) => {
    setBusy(type)
    try {
      const out = await api<{ session: SessionDto }>(`/api/v1/tapasya/sessions/${session.id}/events`, { method: 'POST', body: { events: [{ clientEventId: clientKey(type.toLowerCase()), type }] } })
      offset.current = out.session.serverNow - Date.now()
      setSession(out.session)
    } catch (err) {
      if (type !== 'SYNC') push({ tone: 'error', title: 'Not possible right now', description: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }, [session.id, push])

  React.useEffect(() => {
    const tick = () => {
      const v = view(session.settings, session.engine, Date.now() + offset.current)
      setTimer(v)
      // A phase ended on the clock: let the server record it (and award XP) now.
      if (v.state !== session.engine.state && !syncing.current && !isTerminal(session.engine.state) && Date.now() - lastSync.current > 5000) {
        syncing.current = true
        lastSync.current = Date.now()
        void send('SYNC').finally(() => { syncing.current = false })
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [session, send])

  const ended = isTerminal(session.engine.state)
  React.useEffect(() => {
    if (!ended) return
    void api<SessionHistoryItem[]>('/api/v1/tapasya/sessions?page=1&pageSize=5')
      .then((rows) => setSummary(rows.find((r) => r.id === session.id) ?? null))
      .catch(() => undefined)
  }, [ended, session.id])

  const level = session.restrictionLevel as RestrictionLevel
  const s = session.settings

  if (ended) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-ink-muted">{session.engine.state === 'COMPLETED' ? 'Session complete' : session.engine.state === 'CANCELLED' ? 'Session cancelled' : session.engine.state === 'EXPIRED' ? 'Session expired' : 'Session ended early'}</p>
          <p className="mt-2 text-3xl font-semibold text-ink tnum">{session.completedCycles} of {session.plannedCycles} cycles</p>
          <p className="mt-1 text-sm text-ink-muted tnum">{Math.floor(session.engine.totalFocusMs / 60_000)} focused minutes</p>
          {summary ? (
            <div className="mt-4 text-sm">
              <p className="text-ink"><strong className="tnum">+{summary.xp.validated} XP</strong>{summary.xp.pending ? ` · ${summary.xp.pending} pending` : ''}</p>
              {summary.xp.rejected.filter((r) => r.reason).map((r, i) => <p key={i} className="mt-1 text-ink-muted">Not counted: {r.reason}</p>)}
            </div>
          ) : null}
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => { onClosed(); router.refresh() }}>Start another</Button>
            <Link href="/tapasya/plan" className={buttonVariants({ variant: 'secondary' })}>Back to plan</Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  const progressTone = timer.phase === 'BREAK' ? 'success' : 'brand'
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge tone={timer.phase === 'BREAK' ? 'success' : 'brand'}>{timer.longBreak ? 'Long break' : PHASE_LABEL[timer.phase]}</Badge>
            <Badge tone="neutral">Cycle {timer.cycle} of {timer.plannedCycles}</Badge>
            {timer.state === 'FOCUS_PAUSED' ? <Badge tone="warning">Paused</Badge> : null}
          </div>
          {session.task ? <p className="mt-3 text-sm text-ink-muted">{session.task.title}</p> : null}
          <p className="mt-3 text-6xl font-semibold text-ink tnum" aria-live="off">{timer.phase === 'IDLE' ? '--:--' : formatClock(timer.remainingMs)}</p>
          <Progress className="mt-4" value={Math.round(timer.progress * 100)} tone={progressTone} label="Phase progress" />

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {timer.state === 'FOCUS_ACTIVE' && s.allowPause ? <Button variant="secondary" onClick={() => send('PAUSE')} loading={busy === 'PAUSE'}><Pause aria-hidden /> Pause</Button> : null}
            {timer.state === 'FOCUS_PAUSED' ? <Button onClick={() => send('RESUME')} loading={busy === 'RESUME'}><Play aria-hidden /> Resume</Button> : null}
            {timer.state === 'READY' && timer.nextPhase === 'BREAK' ? <Button onClick={() => send('START_BREAK')} loading={busy === 'START_BREAK'}><Coffee aria-hidden /> Start break</Button> : null}
            {timer.state === 'READY' && timer.nextPhase === 'FOCUS' ? <Button onClick={() => send('START_FOCUS')} loading={busy === 'START_FOCUS'}><Play aria-hidden /> Start focus</Button> : null}
            {(timer.state === 'BREAK_ACTIVE' || (timer.state === 'READY' && timer.nextPhase === 'BREAK')) && s.allowSkipBreak ? <Button variant="secondary" onClick={() => send('SKIP_BREAK')} loading={busy === 'SKIP_BREAK'}><SkipForward aria-hidden /> Skip break</Button> : null}
            <Button variant="ghost" onClick={() => { if (window.confirm('End this session now? A focus interval in progress will not count.')) void send('FINISH') }} loading={busy === 'FINISH'}><Square aria-hidden /> End session</Button>
          </div>
          {timer.state === 'FOCUS_PAUSED' ? <p className="mt-3 text-xs text-ink-subtle">A pause longer than {s.maxPauseMinutes} minutes ends this interval without XP.</p> : null}
          {timer.phase === 'BREAK' ? <p className="mt-3 text-xs text-ink-subtle">Break time is for rest. It does not unlock other apps.</p> : null}
        </CardContent>
      </Card>

      <Notice tone="info" title={RESTRICTION_LABEL[level]}>{RESTRICTION_EXPLANATION[level]}</Notice>
      <p className="text-center text-xs text-ink-subtle tnum">
        {s.focusMinutes} min focus · {s.shortBreakMinutes} min break{s.longBreakMinutes ? ` · ${s.longBreakMinutes} min long break` : ''} · settings set by {session.policySource === 'TEACHER' ? 'your teacher' : session.policySource === 'BUILTIN' ? 'a built-in preset' : 'your preset'}
      </p>
    </div>
  )
}
