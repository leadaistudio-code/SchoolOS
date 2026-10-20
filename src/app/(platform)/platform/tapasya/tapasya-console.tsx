'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, Section } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { validateRules, type PreviewRow, type ScoringRules } from '@/lib/tapasya/scoring'
import type { PlatformLimits } from '@/lib/tapasya/policy'
import { api } from '@/app/(app)/tapasya/_components/api'
import { CheckRow } from '@/app/(app)/tapasya/_components/check-row'
import { formatWhen } from '@/app/(app)/tapasya/_components/format'

type Settings = { leaderboardEnabled: boolean; previewEnabled: boolean; timezone: string; limits: PlatformLimits }
type Overview = { scoring: { version: number; effectiveFrom: string | null; rules: ScoringRules }; settings: Settings }
type Version = { version: number; effectiveFrom: string; reason: string; createdAt: string }
type Season = { id: string; name: string; startsAt: string; endsAt: string }
type ProfileRow = { id: string; alias: string; status: string; school: string; allTimeXp: number; signals: { capped14d: number; rejected14d: number; pending: number }; updatedAt: string }
type AuditRow = { id: string; action: string; summary: string | null; actorLabel: string | null; createdAt: string }
type LedgerRow = { id: string; eventType: string; points: number; status: string; flags: string[]; rejectionReason: string | null; scoringVersion: number; occurredAt: string; correctsId: string | null; correctionReason: string | null }
type Preview = { issues: { message: string }[]; diff: { field: string; from: unknown; to: unknown }[]; samples: PreviewRow[]; currentVersion: number }

const TABS = ['Settings', 'Scoring', 'Seasons', 'Moderation', 'Audit'] as const
type Tab = (typeof TABS)[number]

const RULE_FIELDS: { key: Exclude<keyof ScoringRules, 'durationMode'>; label: string; step?: number }[] = [
  { key: 'basePerInterval', label: 'XP per completed interval' },
  { key: 'perMinute', label: 'XP per minute (per-minute mode)' },
  { key: 'minEligibleFocusMinutes', label: 'Shortest eligible interval (min)' },
  { key: 'maxEligibleFocusMinutes', label: 'Longest eligible interval (min)' },
  { key: 'minCompletionRatio', label: 'Share of interval that must elapse', step: 0.05 },
  { key: 'maxPausesPerInterval', label: 'Pauses allowed per interval' },
  { key: 'frogBonus', label: 'Primary frog bonus' },
  { key: 'allCyclesBonus', label: 'All-cycles bonus' },
  { key: 'allCyclesMinCycles', label: 'Cycles needed for the bonus' },
  { key: 'achievementXp', label: 'XP per achievement' },
  { key: 'dailyCap', label: 'Daily cap' },
  { key: 'weeklyCap', label: 'Weekly cap' },
  { key: 'maxSessionsPerDay', label: 'Session starts per day' },
  { key: 'offlineMaxAgeHours', label: 'Offline sync window (hours)' },
]

const LIMIT_FIELDS: { key: keyof PlatformLimits; label: string }[] = [
  { key: 'minFocusMinutes', label: 'Shortest focus (min)' },
  { key: 'maxFocusMinutes', label: 'Longest focus (min)' },
  { key: 'minBreakMinutes', label: 'Shortest break (min)' },
  { key: 'maxBreakMinutes', label: 'Longest break (min)' },
  { key: 'maxLongBreakMinutes', label: 'Longest long break (min)' },
  { key: 'maxCyclesPerSession', label: 'Cycles per session' },
  { key: 'maxPauseMinutes', label: 'Longest pause (min)' },
  { key: 'idleExpiryMinutes', label: 'Idle session expiry (min)' },
]

function useRun() {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)
  async function run<T>(key: string, fn: () => Promise<T>, done?: string): Promise<T | undefined> {
    setBusy(key)
    try {
      const out = await fn()
      if (done) push({ tone: 'success', title: done })
      router.refresh()
      return out
    } catch (e) {
      push({ tone: 'error', title: 'Not saved', description: (e as Error).message })
      return undefined
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}

/** datetime-local value for "now + minutes", in the browser's zone. */
function localInput(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000)
  d.setSeconds(0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function TapasyaConsole(props: { overview: Overview; versions: Version[]; seasons: Season[]; profiles: ProfileRow[]; audit: AuditRow[] }) {
  const [tab, setTab] = React.useState<Tab>('Settings')
  return (
    <div>
      <div role="tablist" aria-label="Tapasya administration" className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={tab === t ? '-mb-px border-b-2 border-[var(--brand-500)] px-3 py-2 text-sm font-medium text-ink' : 'px-3 py-2 text-sm text-ink-muted hover:text-ink'}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Settings' ? <SettingsPanel settings={props.overview.settings} /> : null}
      {tab === 'Scoring' ? <ScoringPanel current={props.overview.scoring} versions={props.versions} /> : null}
      {tab === 'Seasons' ? <SeasonsPanel seasons={props.seasons} /> : null}
      {tab === 'Moderation' ? <ModerationPanel profiles={props.profiles} /> : null}
      {tab === 'Audit' ? <AuditPanel audit={props.audit} /> : null}
    </div>
  )
}

function SettingsPanel({ settings }: { settings: Settings }) {
  const [s, setS] = React.useState(settings)
  const { busy, run } = useRun()
  const dirty = JSON.stringify(s) !== JSON.stringify(settings)
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title="Global leaderboard">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <CheckRow label="Global leaderboard open" checked={s.leaderboardEnabled} onChange={(e) => setS({ ...s, leaderboardEnabled: e.target.checked })} />
            <CheckRow label="Show the labelled example board (never mixed with live rankings)" checked={s.previewEnabled} onChange={(e) => setS({ ...s, previewEnabled: e.target.checked })} />
            <Field htmlFor="tc-timezone" label="Ranking timezone" hint="Day, week and month boundaries for every school."><Input id="tc-timezone" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} /></Field>
          </CardContent>
        </Card>
      </Section>
      <Section title="Platform Pomodoro limits" description="Outer bounds for every school; school ranges must fit inside.">
        <Card>
          <CardContent className="grid grid-cols-2 gap-3 pt-5">
            {LIMIT_FIELDS.map((f) => (
              <Field key={f.key} htmlFor={`tc-limit-${f.key}`} label={f.label}>
                <Input id={`tc-limit-${f.key}`} type="number" value={s.limits[f.key]} onChange={(e) => setS({ ...s, limits: { ...s.limits, [f.key]: Number(e.target.value) } })} />
              </Field>
            ))}
          </CardContent>
        </Card>
      </Section>
      <div className="flex gap-2 xl:col-span-2">
        <Button disabled={!dirty} loading={busy === 'settings'} onClick={() => run('settings', () => api('/api/v1/platform/tapasya', { method: 'PUT', body: s }), 'Settings saved')}>Save settings</Button>
        {dirty ? <Button variant="ghost" onClick={() => setS(settings)}>Discard</Button> : null}
      </div>
    </div>
  )
}

function ScoringPanel({ current, versions }: { current: Overview['scoring']; versions: Version[] }) {
  const [rules, setRules] = React.useState<ScoringRules>(current.rules)
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [effectiveFrom, setEffectiveFrom] = React.useState(() => localInput(60))
  const [reason, setReason] = React.useState('')
  const { busy, run } = useRun()
  const issues = validateRules(rules)
  const changed = JSON.stringify(rules) !== JSON.stringify(current.rules)

  React.useEffect(() => setPreview(null), [rules])

  async function doPreview() {
    const out = await run('preview', () => api<Preview>('/api/v1/platform/tapasya/scoring?preview=1', { method: 'POST', body: { rules } }))
    if (out) setPreview(out)
  }

  async function publish() {
    if (!window.confirm(`Publish XP rules v${current.version + 1}? They apply to activity from ${new Date(effectiveFrom).toLocaleString()} onwards for every school. Past XP is not re-scored.`)) return
    const out = await run('publish', () => api<{ version: number }>('/api/v1/platform/tapasya/scoring', { method: 'POST', body: { rules, effectiveFrom: new Date(effectiveFrom).toISOString(), reason } }), 'Rules published')
    if (out) {
      setReason('')
      setPreview(null)
    }
  }

  return (
    <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1.2fr_1fr]">
      <Section title={`Rules in force: v${current.version}`} description="The same rules apply to every student in every school. There are no school multipliers, and the device restriction level never changes XP.">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <Field htmlFor="tc-duration-mode" label="Interval scoring">
              <Select id="tc-duration-mode" value={rules.durationMode} onChange={(e) => setRules({ ...rules, durationMode: e.target.value as ScoringRules['durationMode'] })}>
                <option value="FLAT">Flat — same XP for any eligible interval length</option>
                <option value="PER_MINUTE">Per minute — base plus XP per focused minute</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {RULE_FIELDS.map((f) => (
                <Field key={f.key} htmlFor={`tc-rule-${f.key}`} label={f.label}>
                  <Input id={`tc-rule-${f.key}`} type="number" step={f.step ?? 1} value={rules[f.key]} onChange={(e) => setRules({ ...rules, [f.key]: Number(e.target.value) })} />
                </Field>
              ))}
            </div>
            {issues.length ? <Notice tone="danger">{issues.map((i) => i.message).join(' ')}</Notice> : null}
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!changed || issues.length > 0} loading={busy === 'preview'} onClick={doPreview}>Preview change</Button>
              {changed ? <Button variant="ghost" onClick={() => setRules(current.rules)}>Reset</Button> : null}
            </div>
          </CardContent>
        </Card>
      </Section>

      <div className="space-y-5">
        {preview ? (
          <Section title="Preview" description="Nothing is saved until you publish.">
            <Card>
              <CardContent className="space-y-3 pt-5 text-sm">
                <ul className="space-y-1">
                  {preview.diff.map((d) => <li key={d.field}><span className="text-ink-muted">{d.field}:</span> {String(d.from)} → <strong>{String(d.to)}</strong></li>)}
                </ul>
                <TableWrap>
                  <Table>
                    <THead><TR><TH>Example session</TH><TH className="text-right">Now</TH><TH className="text-right">Proposed</TH></TR></THead>
                    <TBody>
                      {preview.samples.map((r) => <TR key={r.label}><TD>{r.label}</TD><TD className="text-right tnum">{r.current}</TD><TD className="text-right tnum">{r.proposed}</TD></TR>)}
                    </TBody>
                  </Table>
                </TableWrap>
                <Field htmlFor="tc-effective-from" label="Effective from" hint="Must be in the future. Activity before this keeps the rules it earned under.">
                  <Input id="tc-effective-from" type="datetime-local" value={effectiveFrom} min={localInput(1)} onChange={(e) => setEffectiveFrom(e.target.value)} />
                </Field>
                <Field htmlFor="tc-reason" label="Reason (recorded in the audit log)" required>
                  <Textarea id="tc-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                </Field>
                <Button disabled={reason.trim().length < 10 || preview.issues.length > 0} loading={busy === 'publish'} onClick={publish}>Publish v{current.version + 1}</Button>
              </CardContent>
            </Card>
          </Section>
        ) : null}

        <Section title="Version history">
          <Card>
            <CardContent className="pt-3">
              {versions.length === 0 ? <p className="py-2 text-sm text-ink-muted">Built-in defaults (v0) are in force. No version has been published.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {versions.map((v) => (
                    <li key={v.version} className="py-2">
                      <div className="flex items-center gap-2"><Badge tone={v.version === current.version ? 'success' : new Date(v.effectiveFrom) > new Date() ? 'info' : 'neutral'}>v{v.version}</Badge><span className="text-ink-muted">from {formatWhen(v.effectiveFrom)}</span></div>
                      <p className="mt-1 text-ink">{v.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  )
}

function SeasonsPanel({ seasons }: { seasons: Season[] }) {
  const [name, setName] = React.useState('')
  const [startsAt, setStartsAt] = React.useState('')
  const [endsAt, setEndsAt] = React.useState('')
  const { busy, run } = useRun()
  const now = Date.now()

  async function create() {
    const out = await run('season', () => api<{ id: string }>('/api/v1/platform/tapasya/seasons', { method: 'POST', body: { name, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() } }), 'Season created')
    if (out) {
      setName('')
      setStartsAt('')
      setEndsAt('')
    }
  }

  return (
    <div className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[1fr_1.2fr]">
      <Section title="New season" description="Seasons cannot overlap. The season board ranks XP earned between the two dates.">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <Field htmlFor="tc-season-name" label="Name" required><Input id="tc-season-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Winter 2026" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field htmlFor="tc-season-starts" label="Starts"><Input id="tc-season-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
              <Field htmlFor="tc-season-ends" label="Ends"><Input id="tc-season-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></Field>
            </div>
            <Button disabled={name.trim().length < 3 || !startsAt || !endsAt} loading={busy === 'season'} onClick={create}>Create season</Button>
          </CardContent>
        </Card>
      </Section>
      <Section title="Seasons">
        {seasons.length === 0 ? <Card><EmptyState title="No seasons yet" description="The season tab on the leaderboard stays empty until one is created." /></Card> : (
          <TableWrap>
            <Table>
              <THead><TR><TH>Name</TH><TH>Starts</TH><TH>Ends</TH><TH /></TR></THead>
              <TBody>
                {seasons.map((s) => {
                  const live = new Date(s.startsAt).getTime() <= now && now < new Date(s.endsAt).getTime()
                  return (
                    <TR key={s.id}>
                      <TD>{s.name}</TD><TD className="tnum">{formatWhen(s.startsAt)}</TD><TD className="tnum">{formatWhen(s.endsAt)}</TD>
                      <TD>{live ? <Badge tone="success">Running</Badge> : new Date(s.startsAt).getTime() > now ? <Badge tone="info">Upcoming</Badge> : <Badge tone="neutral">Ended</Badge>}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Section>
    </div>
  )
}

function ModerationPanel({ profiles }: { profiles: ProfileRow[] }) {
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [rows, setRows] = React.useState(profiles)
  const [open, setOpen] = React.useState<ProfileRow | null>(null)
  const { busy, run } = useRun()

  React.useEffect(() => setRows(profiles), [profiles])

  async function search(e: React.FormEvent) {
    e.preventDefault()
    const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })
    const out = await run('search', () => api<ProfileRow[]>(`/api/v1/platform/tapasya/profiles?${qs}`))
    if (out) setRows(out)
  }

  async function moderate(p: ProfileRow, action: 'SUSPEND' | 'RESTORE') {
    const reason = window.prompt(`${action === 'SUSPEND' ? 'Suspend' : 'Restore'} "${p.alias}" — reason for the audit log:`)
    if (!reason) return
    await run(`mod-${p.id}`, () => api(`/api/v1/platform/tapasya/profiles/${p.id}`, { method: 'PATCH', body: { action, reason } }), action === 'SUSPEND' ? 'Profile suspended and removed from rankings' : 'Profile restored')
  }

  const suspicious = (p: ProfileRow) => p.signals.capped14d >= 7 || p.signals.rejected14d >= 10

  return (
    <div className="space-y-5">
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <Field htmlFor="tc-search-alias" label="Alias"><Input id="tc-search-alias" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search alias" /></Field>
        <Field htmlFor="tc-search-status" label="Status">
          <Select id="tc-search-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            {['ACTIVE', 'PENDING_GUARDIAN', 'SUSPENDED', 'OPTED_OUT', 'SCHOOL_DISABLED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" loading={busy === 'search'}>Search</Button>
      </form>
      <p className="text-xs text-ink-subtle">Signals over the last 14 days: capped awards (repeatedly hitting the daily cap) and rejected intervals. They are prompts to look, not proof of abuse.</p>
      {rows.length === 0 ? <Card><EmptyState title="No profiles" description="Nothing matches." /></Card> : (
        <TableWrap>
          <Table>
            <THead><TR><TH>Alias</TH><TH>School</TH><TH>Status</TH><TH className="text-right">All-time XP</TH><TH className="text-right">Capped</TH><TH className="text-right">Rejected</TH><TH className="text-right">Pending</TH><TH /></TR></THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.id} className={suspicious(p) ? 'bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]' : undefined}>
                  <TD>{p.alias}</TD>
                  <TD className="text-ink-muted">{p.school}</TD>
                  <TD><Badge tone={p.status === 'ACTIVE' ? 'success' : p.status === 'SUSPENDED' ? 'danger' : 'neutral'}>{p.status.replace('_', ' ').toLowerCase()}</Badge></TD>
                  <TD className="text-right tnum">{p.allTimeXp}</TD>
                  <TD className="text-right tnum">{p.signals.capped14d}</TD>
                  <TD className="text-right tnum">{p.signals.rejected14d}</TD>
                  <TD className="text-right tnum">{p.signals.pending}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setOpen(open?.id === p.id ? null : p)}>Ledger</Button>
                      {p.status === 'SUSPENDED'
                        ? <Button size="sm" variant="secondary" loading={busy === `mod-${p.id}`} onClick={() => moderate(p, 'RESTORE')}>Restore</Button>
                        : <Button size="sm" variant="secondary" loading={busy === `mod-${p.id}`} onClick={() => moderate(p, 'SUSPEND')}>Suspend</Button>}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
      {open ? <LedgerPanel profile={open} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

function LedgerPanel({ profile, onClose }: { profile: ProfileRow; onClose: () => void }) {
  const [rows, setRows] = React.useState<LedgerRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const { busy, run } = useRun()

  const load = React.useCallback(() => {
    api<LedgerRow[]>(`/api/v1/platform/tapasya/profiles/${profile.id}`).then(setRows, (e: Error) => setError(e.message))
  }, [profile.id])
  React.useEffect(load, [load])

  async function reverse(r: LedgerRow) {
    const reason = window.prompt(`Reverse ${r.points} XP (${r.eventType}) for "${profile.alias}"? This adds a correction entry; the original stays. Reason:`)
    if (!reason) return
    const out = await run(`rev-${r.id}`, async () => {
      await api(`/api/v1/platform/tapasya/profiles/${profile.id}`, { method: 'POST', body: { xpEventId: r.id, reason } })
      return true
    }, 'Correction recorded')
    if (out) load()
  }

  const reversed = new Set((rows ?? []).filter((r) => r.correctsId).map((r) => r.correctsId))

  return (
    <Section title={`Ledger: ${profile.alias}`} description="Most recent 100 entries." actions={<Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}>
      {error ? <Notice tone="danger">{error}</Notice> : !rows ? <p className="text-sm text-ink-muted">Loading…</p> : (
        <TableWrap>
          <Table>
            <THead><TR><TH>When</TH><TH>Type</TH><TH className="text-right">XP</TH><TH>Status</TH><TH>Rules</TH><TH>Note</TH><TH /></TR></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="tnum whitespace-nowrap">{formatWhen(r.occurredAt)}</TD>
                  <TD>{r.eventType}</TD>
                  <TD className="text-right tnum">{r.points}</TD>
                  <TD><Badge tone={r.status === 'VALIDATED' ? 'success' : r.status === 'PENDING' ? 'warning' : 'neutral'}>{r.status.toLowerCase()}</Badge>{r.flags.map((f) => <Badge key={f} tone="neutral" className="ml-1">{f.toLowerCase()}</Badge>)}</TD>
                  <TD className="tnum">v{r.scoringVersion}</TD>
                  <TD className="text-sm text-ink-muted">{r.correctionReason ?? r.rejectionReason ?? ''}</TD>
                  <TD>{r.status === 'VALIDATED' && r.points > 0 && r.eventType !== 'CORRECTION' && !reversed.has(r.id) ? <Button size="sm" variant="ghost" loading={busy === `rev-${r.id}`} onClick={() => reverse(r)}>Reverse</Button> : reversed.has(r.id) ? <span className="text-xs text-ink-subtle">reversed</span> : null}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </Section>
  )
}

function AuditPanel({ audit }: { audit: AuditRow[] }) {
  if (!audit.length) return <Card><EmptyState title="No platform changes yet" description="Rule publications, settings changes, seasons, moderation and corrections are recorded here." /></Card>
  return (
    <TableWrap>
      <Table>
        <THead><TR><TH>When</TH><TH>Who</TH><TH>Action</TH><TH>Summary</TH></TR></THead>
        <TBody>
          {audit.map((a) => (
            <TR key={a.id}>
              <TD className="tnum whitespace-nowrap">{formatWhen(a.createdAt)}</TD>
              <TD>{a.actorLabel ?? '—'}</TD>
              <TD><Badge tone="neutral">{a.action.replace('tapasya.', '')}</Badge></TD>
              <TD className="text-sm">{a.summary}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  )
}
