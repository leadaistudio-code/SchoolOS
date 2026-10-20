'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { validateSchoolPolicy, type PlatformLimits } from '@/lib/tapasya/policy'
import { api } from '../_components/api'
import { CheckRow } from '../_components/check-row'

type Policy = {
  enabled: boolean
  globalLeaderboardAllowed: boolean
  schoolLeaderboardEnabled: boolean
  minFocusMinutes: number
  maxFocusMinutes: number
  minBreakMinutes: number
  maxBreakMinutes: number
  allowPause: boolean
  allowSkipBreak: boolean
  maxUnlockMinutes: number
  maxUnlockRequestsPerDay: number
}

type NumberKey = 'minFocusMinutes' | 'maxFocusMinutes' | 'minBreakMinutes' | 'maxBreakMinutes' | 'maxUnlockMinutes' | 'maxUnlockRequestsPerDay'
type FlagKey = 'enabled' | 'globalLeaderboardAllowed' | 'schoolLeaderboardEnabled' | 'allowPause' | 'allowSkipBreak'

export function PolicyForm({ policy, platform, globalBoardOpen }: { policy: Policy; platform: PlatformLimits; globalBoardOpen: boolean }) {
  const router = useRouter()
  const { push } = useToast()
  const [p, setP] = React.useState(policy)
  const [busy, setBusy] = React.useState(false)
  const issues = validateSchoolPolicy(p, platform)
  const dirty = JSON.stringify(p) !== JSON.stringify(policy)

  const num = (k: NumberKey) => (e: React.ChangeEvent<HTMLInputElement>) => setP((s) => ({ ...s, [k]: Number(e.target.value) }))
  const flag = (k: FlagKey) => (e: React.ChangeEvent<HTMLInputElement>) => setP((s) => ({ ...s, [k]: e.target.checked }))

  async function save() {
    if (p.globalLeaderboardAllowed !== policy.globalLeaderboardAllowed && !p.globalLeaderboardAllowed && !window.confirm('Turning off global participation hides every student of this school from the global leaderboard. Their XP is kept. Continue?')) return
    setBusy(true)
    try {
      await api('/api/v1/tapasya/policy', { method: 'PUT', body: p })
      push({ tone: 'success', title: 'Settings saved' })
      router.refresh()
    } catch (e) {
      push({ tone: 'error', title: 'Could not save', description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title="Participation">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <CheckRow label="Tapasya Mode is on for this school" checked={p.enabled} onChange={flag('enabled')} />
            <CheckRow label="Students may join the global leaderboard (each still needs a guardian's consent)" checked={p.globalLeaderboardAllowed} onChange={flag('globalLeaderboardAllowed')} />
            <CheckRow label="Show a leaderboard within this school" checked={p.schoolLeaderboardEnabled} onChange={flag('schoolLeaderboardEnabled')} />
            {!globalBoardOpen ? <Notice tone="info">The global leaderboard is currently paused by MyCampusView for all schools.</Notice> : null}
            <p className="text-xs text-ink-subtle">The school board shows first name and last initial to classmates. The global board only ever shows aliases.</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Timer ranges" description={`Must sit within the platform range: focus ${platform.minFocusMinutes}–${platform.maxFocusMinutes} min, break ${platform.minBreakMinutes}–${platform.maxBreakMinutes} min.`}>
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="grid grid-cols-2 gap-3">
              <Field htmlFor="tps-shortest-focus" label="Shortest focus (min)"><Input id="tps-shortest-focus" type="number" value={p.minFocusMinutes} onChange={num('minFocusMinutes')} /></Field>
              <Field htmlFor="tps-longest-focus" label="Longest focus (min)"><Input id="tps-longest-focus" type="number" value={p.maxFocusMinutes} onChange={num('maxFocusMinutes')} /></Field>
              <Field htmlFor="tps-shortest-break" label="Shortest break (min)"><Input id="tps-shortest-break" type="number" value={p.minBreakMinutes} onChange={num('minBreakMinutes')} /></Field>
              <Field htmlFor="tps-longest-break" label="Longest break (min)"><Input id="tps-longest-break" type="number" value={p.maxBreakMinutes} onChange={num('maxBreakMinutes')} /></Field>
            </div>
            <CheckRow label="Students may pause a focus interval" checked={p.allowPause} onChange={flag('allowPause')} />
            <CheckRow label="Students may skip a break" checked={p.allowSkipBreak} onChange={flag('allowSkipBreak')} />
            <p className="text-xs text-ink-subtle">Students’ saved presets outside these ranges are kept but cannot be started until edited — nothing is changed silently.</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Guardian unlock requests">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="grid grid-cols-2 gap-3">
              <Field htmlFor="tps-longest-unlock" label="Longest unlock (min)"><Input id="tps-longest-unlock" type="number" min={1} max={120} value={p.maxUnlockMinutes} onChange={num('maxUnlockMinutes')} /></Field>
              <Field htmlFor="tps-requests-per-student-per-day" label="Requests per student per day"><Input id="tps-requests-per-student-per-day" type="number" min={0} max={50} value={p.maxUnlockRequestsPerDay} onChange={num('maxUnlockRequestsPerDay')} /></Field>
            </div>
            <p className="text-xs text-ink-subtle">Codes are sent to the guardian over WhatsApp (SMS fallback), expire after 10 minutes and lock after five wrong tries. Guardians can also decide in the parent app.</p>
          </CardContent>
        </Card>
      </Section>

      <div className="xl:col-span-2">
        {issues.length ? <Notice tone="danger" className="mb-3">{issues.map((i) => i.message).join(' ')}</Notice> : null}
        <div className="flex gap-2">
          <Button onClick={save} loading={busy} disabled={!dirty || issues.length > 0}>Save settings</Button>
          {dirty ? <Button variant="ghost" onClick={() => setP(policy)}>Discard changes</Button> : null}
        </div>
      </div>
    </div>
  )
}
