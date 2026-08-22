'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Field, Input } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import {
  createIngestTokenAction,
  revokeIngestTokenAction,
  setBusDeviceAction,
} from './actions'

type Token = {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

type TrackedBus = {
  id: string
  code: string
  registrationNo: string
  gpsDeviceId: string | null
  isActive: boolean
  lastFixAt: string | null
}

const DATE = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function when(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '—'
}

/**
 * Connecting hardware.
 *
 * Written as a setup guide rather than a settings form, because this is a job
 * somebody does once: mint a credential, paste it into a GPS server, then
 * match each device to the bus it is bolted into. Getting the last part wrong
 * is the failure people actually hit — a parent watching the wrong bus — so the
 * device table shows when each tracker last reported, which is the only way to
 * tell a correct mapping from a plausible one.
 */
export function TrackingSetup({
  tokens,
  buses,
  endpoint,
}: {
  tokens: Token[]
  buses: TrackedBus[]
  endpoint: string
}) {
  const router = useRouter()
  const toast = useToast()

  const [creating, setCreating] = React.useState(false)
  const [name, setName] = React.useState('Traccar')
  const [issued, setIssued] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()

  const live = tokens.filter((t) => !t.revokedAt)

  const create = () =>
    start(async () => {
      const result = await createIngestTokenAction(name)
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not create the token', description: result.message })
        return
      }
      setIssued(result.data?.token ?? null)
      setCreating(false)
      router.refresh()
    })

  const revoke = (id: string) =>
    start(async () => {
      const result = await revokeIngestTokenAction(id)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Token revoked' : 'Could not revoke',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })

  return (
    <div className="space-y-4">
      <Notice tone="info" title="How this fits together">
        A tracker in the bus reports to a GPS server; that server forwards each
        position here. <span className="font-medium">Traccar</span> is the usual choice — it is
        open source and already speaks the protocols of a few hundred devices, including the
        AIS-140 units Indian school transport is regulated around. One endpoint then covers every
        device you will ever buy, and changing hardware later changes nothing here.
      </Notice>

      <Card>
        <CardHeader>
          <CardTitle>Where to send positions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CopyRow label="Endpoint" value={endpoint} />
          <CopyRow label="Method and headers" value={`POST · Authorization: Bearer <token> · Content-Type: application/json`} />

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">In Traccar</p>
            <p className="text-sm text-ink-muted">
              Set <code className="text-xs">forward.enable = true</code>,{' '}
              <code className="text-xs">forward.type = json</code>,{' '}
              <code className="text-xs">forward.url</code> to the endpoint above, and{' '}
              <code className="text-xs">forward.header</code> to{' '}
              <code className="text-xs">Authorization: Bearer …</code>. Each device&apos;s{' '}
              <span className="font-medium">unique id</span> in Traccar is what you paste into the
              table below.
            </p>
          </div>

          <p className="text-xs text-ink-subtle">
            Flat payloads work too — anything carrying a device id with{' '}
            <code>lat</code>/<code>lon</code> is accepted, batched or single, so a vendor&apos;s own
            middleware can post here directly. A batch replayed after a dead spot is stored in full.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Ingest tokens</CardTitle>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New token
          </Button>
        </CardHeader>

        {tokens.length === 0 ? (
          <EmptyState
            title="No tokens yet"
            description="Create one and paste it into your GPS server. Nothing can post positions without it."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Token</TH>
                  <TH>Last used</TH>
                  <TH>Created</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {tokens.map((token) => (
                  <TR key={token.id} className={token.revokedAt ? 'opacity-60' : undefined}>
                    <TD className="font-medium text-ink">{token.name}</TD>
                    <TD className="font-mono text-xs">{token.prefix}…</TD>
                    <TD>
                      {token.revokedAt ? (
                        <Badge tone="danger">revoked</Badge>
                      ) : token.lastUsedAt ? (
                        when(token.lastUsedAt)
                      ) : (
                        <span className="text-ink-subtle">never</span>
                      )}
                    </TD>
                    <TD>{when(token.createdAt)}</TD>
                    <TD align="right">
                      {token.revokedAt ? null : (
                        <IconButton
                          variant="ghost"
                          small
                          label={`Revoke ${token.name}`}
                          disabled={pending}
                          onClick={() => revoke(token.id)}
                        >
                          <Trash2 aria-hidden />
                        </IconButton>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}

        {live.length === 0 && tokens.length > 0 ? (
          <div className="border-t border-line px-4 py-3">
            <Notice tone="warning">
              Every token is revoked, so nothing can post positions. Create a new one to start
              receiving again.
            </Notice>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Which device is in which bus</CardTitle>
          <span className="text-xs text-ink-subtle">
            {buses.filter((b) => b.gpsDeviceId).length} of {buses.length} linked
          </span>
        </CardHeader>

        {buses.length === 0 ? (
          <EmptyState title="No buses on record" description="Add a bus before linking a tracker." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Bus</TH>
                  <TH>Registration</TH>
                  <TH>Tracker device id</TH>
                  <TH>Last reported</TH>
                </tr>
              </THead>
              <TBody>
                {buses.map((bus) => (
                  <DeviceRow key={bus.id} bus={bus} />
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}

        <div className="border-t border-line px-4 py-3">
          <p className="text-xs text-ink-subtle">
            Leave a bus blank to keep tracking it from the driver&apos;s phone. The two work side by
            side — a bus with a tracker fitted simply stops depending on somebody remembering to
            keep the app open.
          </p>
        </div>
      </Card>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New ingest token"
        description="Name it after the system that will use it, so a revoked token later is obvious."
        size="sm"
        footer={
          <>
            <Button onClick={create} loading={pending} disabled={!name.trim()}>
              Create token
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="token-name" required>
          <Input
            id="token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Traccar"
            autoFocus
          />
        </Field>
      </Dialog>

      <Dialog
        open={issued !== null}
        onClose={() => setIssued(null)}
        title="Copy this token now"
        description="It is stored only as a hash and cannot be shown again. If it is lost, revoke it and create another."
        footer={
          <Button onClick={() => setIssued(null)}>I have copied it</Button>
        }
      >
        {issued ? (
          <div className="space-y-3">
            <CopyRow label="Ingest token" value={issued} mono />
            <Notice tone="warning">
              Treat it like a password. Anyone holding it can write bus positions for your school.
            </Notice>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}

function DeviceRow({ bus }: { bus: TrackedBus }) {
  const router = useRouter()
  const toast = useToast()
  const [value, setValue] = React.useState(bus.gpsDeviceId ?? '')
  const [pending, start] = React.useTransition()

  const dirty = value.trim() !== (bus.gpsDeviceId ?? '')

  const save = () =>
    start(async () => {
      const result = await setBusDeviceAction(bus.id, value.trim())
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? `Bus ${bus.code} updated` : 'Could not link the device',
        description: result.message,
      })
      if (result.ok) router.refresh()
      else setValue(bus.gpsDeviceId ?? '')
    })

  return (
    <TR>
      <TD className="font-medium text-ink">{bus.code}</TD>
      <TD>{bus.registrationNo}</TD>
      <TD>
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="IMEI or unique id"
            aria-label={`Tracker device id for bus ${bus.code}`}
            className="max-w-56 font-mono text-xs"
          />
          {dirty ? (
            <Button size="sm" variant="secondary" onClick={save} loading={pending}>
              Save
            </Button>
          ) : null}
        </div>
      </TD>
      <TD>
        {bus.lastFixAt ? (
          when(bus.lastFixAt)
        ) : (
          <span className="text-ink-subtle">never</span>
        )}
      </TD>
    </TR>
  )
}

/** A value alongside the one button anybody wants next to it. */
function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the value is on screen and selectable anyway.
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-muted">{label}</p>
      <div className="flex items-center gap-2">
        <code
          className={`min-w-0 flex-1 truncate rounded-[var(--radius-sm)] border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink ${mono ? 'font-mono' : ''}`}
        >
          {value}
        </code>
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}
