'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Download, KeyRound, Pencil, Plus, Trash2, Unplug } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { WEEKDAYS, ZONE_LABEL, type Zone } from '@/lib/cctv'
import type { CctvSiteView, RelayStatus } from '@/server/modules/cctv/service'
import { createRelayKeyAction, deleteCameraAction, revokeRelayKeyAction, saveCameraAction, saveSiteAction } from './actions'

function Toggle({ checked, onChange, title, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-line p-3">
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-subtle">{hint}</span>
      </span>
    </label>
  )
}

export function SiteForm({ site }: { site: CctvSiteView }) {
  const toast = useToast()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [form, setForm] = useState({
    name: site.name,
    enabled: site.enabled,
    streamBaseUrl: site.streamBaseUrl ?? '',
    nvrHost: site.nvrHost ?? '',
    nvrPort: String(site.nvrPort),
    nvrUsername: site.nvrUsername ?? '',
    parentAccessEnabled: site.parentAccessEnabled,
    parentStart: site.parentStart,
    parentEnd: site.parentEnd,
    parentDays: site.parentDays,
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  function save() {
    start(async () => {
      const r = await saveSiteAction({ ...form, nvrPort: Number(form.nvrPort) || 554 })
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Saved' : 'Could not save', description: r.message })
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Recorder (NVR) on the school network</h3>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
          <Field label="Recorder IP address" htmlFor="nvr-host" hint="Shown in iCMOB under Device → Device info, or on the NVR screen. Example: 192.168.1.108">
            <Input id="nvr-host" value={form.nvrHost} onChange={(e) => set('nvrHost', e.target.value)} placeholder="192.168.1.108" />
          </Field>
          <Field label="RTSP port" htmlFor="nvr-port" hint="Usually 554">
            <Input id="nvr-port" inputMode="numeric" value={form.nvrPort} onChange={(e) => set('nvrPort', e.target.value)} />
          </Field>
        </div>
        <Field
          label="Recorder username"
          htmlFor="nvr-user"
          hint="Best: create a separate user on the NVR with only ‘live view’ rights. Its password is typed into the relay app on the school PC and never saved in MyCampusView."
        >
          <Input id="nvr-user" value={form.nvrUsername} onChange={(e) => set('nvrUsername', e.target.value)} placeholder="viewer" autoComplete="off" />
        </Field>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Live view</h3>
        <Field label="Name" htmlFor="site-name">
          <Input id="site-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Stream address" htmlFor="stream-url" hint="The https address of your Cloudflare tunnel, for example https://cctv.yourschool.com">
          <Input id="stream-url" value={form.streamBaseUrl} onChange={(e) => set('streamBaseUrl', e.target.value)} placeholder="https://cctv.yourschool.com" />
        </Field>
        <Toggle
          checked={form.enabled}
          onChange={(v) => set('enabled', v)}
          title="Switch live CCTV on"
          hint="Admins and the principal see every camera. The front office sees gate cameras only."
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Parents</h3>
        <Toggle
          checked={form.parentAccessEnabled}
          onChange={(v) => set('parentAccessEnabled', v)}
          title="Let parents watch their child’s classroom"
          hint="Only the classroom camera of their own child’s class, only during the hours below. Their picture stops by itself when the time is up."
        />
        {form.parentAccessEnabled ? (
          <div className="space-y-3 rounded-[var(--radius-sm)] bg-bg p-3">
            <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
              <Field label="From" htmlFor="p-start">
                <Input id="p-start" type="time" value={form.parentStart} onChange={(e) => set('parentStart', e.target.value)} />
              </Field>
              <Field label="Until" htmlFor="p-end">
                <Input id="p-end" type="time" value={form.parentEnd} onChange={(e) => set('parentEnd', e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
              {WEEKDAYS.map((d) => {
                const on = form.parentDays.includes(d.value)
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('parentDays', on ? form.parentDays.filter((x) => x !== d.value) : [...form.parentDays, d.value])}
                    className={
                      on
                        ? 'rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-contrast'
                        : 'rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-muted hover:text-ink'
                    }
                  >
                    {d.short}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <Button onClick={save} loading={pending}>
        Save
      </Button>
    </div>
  )
}

export type CameraRow = {
  id: string
  name: string
  channel: number
  zone: Zone
  sectionId: string | null
  sectionLabel: string | null
  sortOrder: number
  enabled: boolean
}

type Draft = { id?: string; name: string; channel: string; zone: Zone; sectionId: string; sortOrder: string; enabled: boolean }

export function CameraList({ cameras, sections }: { cameras: CameraRow[]; sections: { id: string; label: string }[] }) {
  const toast = useToast()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState<Draft | null>(null)

  function openNew() {
    const used = new Set(cameras.map((c) => c.channel))
    let next = 1
    while (used.has(next)) next++
    setDraft({ name: '', channel: String(next), zone: 'GENERAL', sectionId: '', sortOrder: String(next), enabled: true })
  }

  function save() {
    if (!draft) return
    start(async () => {
      const r = await saveCameraAction({
        id: draft.id,
        name: draft.name,
        channel: Number(draft.channel),
        zone: draft.zone,
        sectionId: draft.zone === 'CLASSROOM' ? draft.sectionId || null : null,
        sortOrder: Number(draft.sortOrder) || 0,
        enabled: draft.enabled,
      })
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Saved' : 'Could not save', description: r.message })
      if (r.ok) {
        setDraft(null)
        router.refresh()
      }
    })
  }

  function remove(cam: CameraRow) {
    if (!window.confirm(`Remove "${cam.name}"? The relay app picks this up by itself; with a manual setup, download a fresh settings file afterwards.`)) return
    start(async () => {
      const r = await deleteCameraAction(cam.id)
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Removed' : 'Could not remove', description: r.message })
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {cameras.length === 0 ? (
        <p className="text-sm text-ink-muted">No cameras yet. Add one for each channel on the recorder you want to watch.</p>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--radius-sm)] border border-line">
          {cameras.map((cam) => (
            <li key={cam.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-bg text-xs font-semibold text-ink-muted">{cam.channel}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{cam.name}</p>
                <p className="truncate text-xs text-ink-subtle">
                  {ZONE_LABEL[cam.zone]}
                  {cam.sectionLabel ? ` · ${cam.sectionLabel}` : ''}
                </p>
              </div>
              {!cam.enabled ? <Badge tone="neutral">Hidden</Badge> : null}
              {cam.zone === 'GATE' ? <Badge tone="info">Front office can see</Badge> : null}
              {cam.zone === 'CLASSROOM' ? <Badge tone="brand">Parents of this class</Badge> : null}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${cam.name}`}
                onClick={() =>
                  setDraft({
                    id: cam.id,
                    name: cam.name,
                    channel: String(cam.channel),
                    zone: cam.zone,
                    sectionId: cam.sectionId ?? '',
                    sortOrder: String(cam.sortOrder),
                    enabled: cam.enabled,
                  })
                }
              >
                <Pencil aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${cam.name}`} onClick={() => remove(cam)} disabled={pending}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" size="sm" onClick={openNew}>
        <Plus aria-hidden /> Add camera
      </Button>

      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit camera' : 'Add camera'}
        description="The channel is the camera number on the recorder (CH1, CH2 …), as shown in iCMOB."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={pending}>
              Save
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px]">
              <Field label="Name" htmlFor="cam-name">
                <Input id="cam-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Main gate" />
              </Field>
              <Field label="Channel" htmlFor="cam-ch">
                <Input id="cam-ch" inputMode="numeric" value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })} />
              </Field>
            </div>
            <Field label="What it watches" htmlFor="cam-zone" hint="Decides who may see it.">
              <Select id="cam-zone" value={draft.zone} onChange={(e) => setDraft({ ...draft, zone: e.target.value as Zone })}>
                <option value="GENERAL">General (admins and principal only)</option>
                <option value="GATE">Gate / entrance (front office too)</option>
                <option value="CLASSROOM">Classroom (parents of that class too)</option>
              </Select>
            </Field>
            {draft.zone === 'CLASSROOM' ? (
              <Field label="Class" htmlFor="cam-section">
                <Select id="cam-section" value={draft.sectionId} onChange={(e) => setDraft({ ...draft, sectionId: e.target.value })}>
                  <option value="">Pick a class</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Order on screen" htmlFor="cam-order">
                <Input id="cam-order" inputMode="numeric" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
                <Checkbox checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> Show this camera
              </label>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}

function ago(iso: string, now: number) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function RelayApp({ status, online, downloadUrl, now }: { status: RelayStatus; online: boolean; downloadUrl: string; now: number }) {
  const toast = useToast()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [key, setKey] = useState<string | null>(null)

  function create() {
    if (status.connected && !window.confirm('Create a new key? The relay app using the old key stops until you paste the new one into it.')) return
    start(async () => {
      const r = await createRelayKeyAction()
      if (r.ok && r.key) {
        setKey(r.key)
        router.refresh()
      } else toast.push({ tone: 'error', title: 'Could not create a key', description: r.message })
    })
  }

  function revoke() {
    if (!window.confirm('Disconnect the relay app? Live CCTV keeps working until the app next checks in, then it stops updating.')) return
    start(async () => {
      const r = await revokeRelayKeyAction()
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Disconnected' : 'Could not disconnect', description: r.message })
      if (r.ok) {
        setKey(null)
        router.refresh()
      }
    })
  }

  async function copy() {
    if (!key) return
    await navigator.clipboard.writeText(key).catch(() => null)
    toast.push({ tone: 'success', title: 'Copied', description: 'Paste it into the relay app on the school PC.' })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!status.connected ? (
          <Badge tone="neutral">Not connected</Badge>
        ) : online ? (
          <Badge tone="success">Online</Badge>
        ) : (
          <Badge tone="warning">Offline</Badge>
        )}
        {status.lastSeenAt ? (
          <span className="text-xs text-ink-subtle">
            Last check-in {ago(status.lastSeenAt, now)}
            {status.appVersion ? ` · app ${status.appVersion}` : ''}
          </span>
        ) : status.connected ? (
          <span className="text-xs text-ink-subtle">Key …{status.keyHint} created, waiting for the app</span>
        ) : null}
      </div>

      {key ? (
        <div className="space-y-2 rounded-[var(--radius-sm)] border border-brand/40 bg-brand/5 p-3">
          <p className="text-xs font-medium text-ink">Connection key. It is shown only once, so copy it now.</p>
          <div className="flex gap-2">
            <Input readOnly value={key} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label="Connection key" />
            <Button variant="secondary" size="sm" onClick={copy}>
              <Copy aria-hidden /> Copy
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <a href={downloadUrl} download className={buttonVariants({ variant: 'primary', size: 'sm' })}>
          <Download aria-hidden /> Download relay app
        </a>
        <Button variant="secondary" size="sm" onClick={create} loading={pending && !status.connected}>
          <KeyRound aria-hidden /> {status.connected ? 'New connection key' : 'Create connection key'}
        </Button>
        {status.connected ? (
          <Button variant="ghost" size="sm" onClick={revoke} disabled={pending}>
            <Unplug aria-hidden /> Disconnect
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function RelayDownload({ ready, username }: { ready: boolean; username: string | null }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [includeHd, setIncludeHd] = useState(false)
  const [busy, setBusy] = useState(false)

  async function download(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const body = new FormData()
      body.set('password', password)
      if (includeHd) body.set('includeHd', 'on')
      const res = await fetch('/api/v1/cctv/relay-config', { method: 'POST', body })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error?.message ?? 'Could not create the file')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mediamtx.yml'
      a.click()
      URL.revokeObjectURL(url)
      setPassword('')
      toast.push({ tone: 'success', title: 'Downloaded', description: 'Copy mediamtx.yml into the MediaMTX folder on the school PC.' })
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not download', description: err instanceof Error ? err.message : 'Try again' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={download} className="space-y-3">
      <Field
        label={`Recorder password${username ? ` for “${username}”` : ''}`}
        htmlFor="nvr-pass"
        hint="Goes only into the downloaded file. MyCampusView does not keep it."
      >
        <Input id="nvr-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!ready} />
      </Field>
      <label className="flex items-start gap-2 text-sm text-ink">
        <Checkbox checked={includeHd} onChange={(e) => setIncludeHd(e.target.checked)} className="mt-0.5" disabled={!ready} />
        <span>
          Also offer HD (main stream) when a camera is opened
          <span className="block text-xs text-ink-subtle">Only if the recorder sends HD as H.264. Uses much more internet.</span>
        </span>
      </label>
      <Button type="submit" loading={busy} disabled={!ready}>
        <Download aria-hidden /> Download settings file
      </Button>
      {!ready ? <p className="text-xs text-ink-subtle">Save the recorder address and add at least one camera first.</p> : null}
    </form>
  )
}
