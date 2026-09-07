'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Field, Input } from '@/components/ui/input'
import { Notice, EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'

type Overview = {
  connectors: number
  onlineDevices: number
  offlineDevices: number
  eventsToday: number
  unmappedUsers: number
  pendingSync: number
}

type Connector = {
  id: string
  name: string
  hostname: string | null
  version: string | null
  status: string
  pendingEvents: number
  lastSeenAt: string | null
  online: boolean
  _count: { devices: number }
}

type Device = {
  id: string
  name: string
  brand: string
  model: string
  locationLabel: string | null
  status: string
  lastSyncAt: string | null
  lastEventAt: string | null
  lastError: string | null
  connector: { id: string; name: string }
}

type Tab = 'overview' | 'connectors' | 'devices' | 'mappings' | 'events' | 'settings'

const DATE = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

async function apiGet(tab: string, extra = '') {
  const res = await fetch(`/api/v1/biometric?tab=${tab}${extra}`, { cache: 'no-store' })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message ?? 'Request failed')
  return json.data
}

async function apiPost(body: Record<string, unknown>) {
  const res = await fetch('/api/v1/biometric', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message ?? 'Request failed')
  return json.data
}

export function BiometricConsole({ canManage }: { canManage: boolean }) {
  const toast = useToast()
  const [tab, setTab] = React.useState<Tab>('overview')
  const [overview, setOverview] = React.useState<Overview | null>(null)
  const [connectors, setConnectors] = React.useState<Connector[]>([])
  const [devices, setDevices] = React.useState<Device[]>([])
  const [events, setEvents] = React.useState<Array<Record<string, unknown>>>([])
  const [mappings, setMappings] = React.useState<Array<Record<string, unknown>>>([])
  const [settings, setSettings] = React.useState<Record<string, unknown> | null>(null)
  const [pairingCode, setPairingCode] = React.useState<string | null>(null)
  const [pairingName, setPairingName] = React.useState('Office Connector')
  const [mapExternalId, setMapExternalId] = React.useState('')
  const [mapAdmissionNo, setMapAdmissionNo] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async (next: Tab) => {
    setLoading(true)
    try {
      if (next === 'overview') setOverview(await apiGet('overview'))
      if (next === 'connectors') setConnectors(await apiGet('connectors'))
      if (next === 'devices') setDevices(await apiGet('devices'))
      if (next === 'events') {
        const data = await apiGet('events')
        setEvents(data.rows ?? [])
      }
      if (next === 'mappings') {
        const data = await apiGet('mappings', '&status=unmapped')
        setMappings(data.rows ?? [])
      }
      if (next === 'settings') setSettings(await apiGet('settings'))
    } catch (err) {
      toast.push({
        tone: 'error',
        title: err instanceof Error ? err.message : 'Failed to load',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => {
    void load(tab)
  }, [tab, load])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'connectors', label: 'Connectors' },
    { id: 'devices', label: 'Devices' },
    { id: 'mappings', label: 'User mapping' },
    { id: 'events', label: 'Event logs' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? 'primary' : 'secondary'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {loading && <Notice tone="info">Loading…</Notice>}

      {tab === 'overview' && overview && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Connectors', overview.connectors],
            ['Online devices', overview.onlineDevices],
            ['Offline devices', overview.offlineDevices],
            ['Events today', overview.eventsToday],
            ['Unmapped punches', overview.unmappedUsers],
            ['Pending process', overview.pendingSync],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{value as number}</CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'connectors' && (
        <div className="space-y-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Pair MyCampusView Connect</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <Field label="Connector name">
                  <Input value={pairingName} onChange={(e) => setPairingName(e.target.value)} />
                </Field>
                <Button
                  onClick={async () => {
                    try {
                      const row = await apiPost({
                        action: 'create_pairing',
                        connectorName: pairingName,
                      })
                      setPairingCode(row.codeDisplay)
                      toast.push({
                        tone: 'success',
                        title: 'Pairing code created — expires in 30 minutes',
                      })
                      await load('connectors')
                    } catch (err) {
                      toast.push({
                        tone: 'error',
                        title: err instanceof Error ? err.message : 'Failed',
                      })
                    }
                  }}
                >
                  Generate pairing code
                </Button>
              </CardContent>
              {pairingCode && (
                <CardContent>
                  <Notice tone="success">
                    Enter this code in MyCampusView Connect: <strong>{pairingCode}</strong>
                  </Notice>
                </CardContent>
              )}
            </Card>
          )}

          {connectors.length === 0 ? (
            <EmptyState title="No connectors yet" description="Generate a pairing code and install MyCampusView Connect on a school Windows PC." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Host</TH>
                    <TH>Version</TH>
                    <TH>Devices</TH>
                    <TH>Pending</TH>
                    <TH>Last seen</TH>
                    <TH>Status</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {connectors.map((c) => (
                    <TR key={c.id}>
                      <TD>{c.name}</TD>
                      <TD>{c.hostname ?? '—'}</TD>
                      <TD>{c.version ?? '—'}</TD>
                      <TD>{c._count.devices}</TD>
                      <TD>{c.pendingEvents}</TD>
                      <TD>{c.lastSeenAt ? DATE.format(new Date(c.lastSeenAt)) : '—'}</TD>
                      <TD>
                        <Badge tone={c.online ? 'success' : 'warning'}>
                          {c.online ? 'Online' : c.status}
                        </Badge>
                      </TD>
                      <TD>
                        {canManage && c.status !== 'REVOKED' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              await apiPost({ action: 'revoke_connector', connectorId: c.id })
                              toast.push({ tone: 'success', title: 'Connector revoked' })
                              await load('connectors')
                            }}
                          >
                            Revoke
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'devices' && (
        devices.length === 0 ? (
          <EmptyState
            title="No devices registered"
            description="After Connect is paired, add a Realtime RS9W or Simulator device in the Connect setup utility. Devices appear here automatically."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Device</TH>
                  <TH>Location</TH>
                  <TH>Brand / model</TH>
                  <TH>Connector</TH>
                  <TH>Last event</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {devices.map((d) => (
                  <TR key={d.id}>
                    <TD>{d.name}</TD>
                    <TD>{d.locationLabel ?? '—'}</TD>
                    <TD>
                      {d.brand} {d.model}
                    </TD>
                    <TD>{d.connector.name}</TD>
                    <TD>{d.lastEventAt ? DATE.format(new Date(d.lastEventAt)) : '—'}</TD>
                    <TD>
                      <Badge tone={d.status === 'ONLINE' ? 'success' : 'warning'}>{d.status}</Badge>
                    </TD>
                    <TD className="space-x-2">
                      {canManage && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              await apiPost({
                                action: 'enqueue_command',
                                connectorId: d.connector.id,
                                deviceId: d.id,
                                type: 'SYNC_DEVICE',
                              })
                              toast.push({ tone: 'success', title: 'Sync command queued' })
                            }}
                          >
                            Sync now
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              await apiPost({
                                action: 'set_device_active',
                                deviceId: d.id,
                                active: false,
                              })
                              toast.push({ tone: 'success', title: 'Device disabled' })
                              await load('devices')
                            }}
                          >
                            Disable
                          </Button>
                        </>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )
      )}

      {tab === 'mappings' && (
        <div className="space-y-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Map a device user</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <Field label="Device user ID">
                  <Input value={mapExternalId} onChange={(e) => setMapExternalId(e.target.value)} placeholder="e.g. 1520" />
                </Field>
                <Field label="Admission No">
                  <Input
                    value={mapAdmissionNo}
                    onChange={(e) => setMapAdmissionNo(e.target.value)}
                    placeholder="e.g. ADM-2026-158"
                  />
                </Field>
                <Button
                  onClick={async () => {
                    try {
                      const result = await apiPost({
                        action: 'upsert_mapping',
                        externalUserId: mapExternalId,
                        subjectType: 'STUDENT',
                        admissionNo: mapAdmissionNo,
                      })
                      toast.push({
                        tone: 'success',
                        title: `Mapped. Reprocessed ${result.reprocessed} events.`,
                      })
                      setMapExternalId('')
                      setMapAdmissionNo('')
                      await load('mappings')
                    } catch (err) {
                      toast.push({
                        tone: 'error',
                        title: err instanceof Error ? err.message : 'Mapping failed',
                      })
                    }
                  }}
                >
                  Save mapping
                </Button>
              </CardContent>
            </Card>
          )}
          <Notice tone="info">
            Showing unmapped device users seen in raw events. Map them to a student or staff record to process attendance.
          </Notice>
          {mappings.length === 0 ? (
            <EmptyState title="No unmapped users" description="All seen device user IDs are mapped, or no events have arrived yet." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Device user</TH>
                    <TH>Last punch</TH>
                    <TH>Events</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {mappings.map((m) => (
                    <TR key={String(m.externalUserId)}>
                      <TD>{String(m.externalUserId)}</TD>
                      <TD>
                        {m.lastPunchAt ? DATE.format(new Date(String(m.lastPunchAt))) : '—'}
                      </TD>
                      <TD>{String(m.eventCount ?? '—')}</TD>
                      <TD>
                        <Badge tone="warning">{String(m.mappingStatus)}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'events' && (
        events.length === 0 ? (
          <EmptyState title="No biometric events yet" description="Punches from MyCampusView Connect appear here as immutable raw events." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Time</TH>
                  <TH>Device</TH>
                  <TH>User</TH>
                  <TH>Person</TH>
                  <TH>Method</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {events.map((e) => (
                  <TR key={String(e.id)}>
                    <TD>{DATE.format(new Date(String(e.deviceLocalAt)))}</TD>
                    <TD>{(e.device as { name?: string } | null)?.name ?? '—'}</TD>
                    <TD>{String(e.externalUserId)}</TD>
                    <TD>{String(e.mappedPerson ?? '—')}</TD>
                    <TD>{String(e.verificationMethod)}</TD>
                    <TD>
                      <Badge tone={e.status === 'PROCESSED' ? 'success' : 'warning'}>
                        {String(e.status)}
                      </Badge>
                    </TD>
                    <TD>
                      {canManage && e.status !== 'PROCESSED' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            await apiPost({ action: 'reprocess_event', eventId: e.id })
                            toast.push({ tone: 'success', title: 'Reprocessed' })
                            await load('events')
                          }}
                        >
                          Reprocess
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )
      )}

      {tab === 'settings' && settings && (
        <Card>
          <CardHeader>
            <CardTitle>Biometric attendance settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ['enabled', 'Enable biometric attendance'],
                ['studentAttendance', 'Process student punches'],
                ['staffAttendance', 'Process staff punches'],
                ['notifyParentOnEntry', 'Notify parent on entry'],
                ['notifyParentOnExit', 'Notify parent on exit'],
                ['requireManualConflictReview', 'Require review when biometric conflicts with manual ABSENT'],
                ['autoProcess', 'Auto-process events on ingest'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  disabled={!canManage}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
            <Field label="Duplicate punch window (seconds)">
              <Input
                type="number"
                disabled={!canManage}
                value={Number(settings.duplicatePunchWindowSec ?? 30)}
                onChange={(e) =>
                  setSettings({ ...settings, duplicatePunchWindowSec: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Student late after (minutes from midnight, school TZ)">
              <Input
                type="number"
                disabled={!canManage}
                value={Number(settings.studentLateAfterMinutes ?? 540)}
                onChange={(e) =>
                  setSettings({ ...settings, studentLateAfterMinutes: Number(e.target.value) })
                }
              />
            </Field>
            {canManage && (
              <Button
                onClick={async () => {
                  await apiPost({ action: 'save_settings', settings })
                  toast.push({ tone: 'success', title: 'Settings saved' })
                }}
              >
                Save settings
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
