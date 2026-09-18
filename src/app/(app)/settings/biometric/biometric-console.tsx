'use client'

import * as React from 'react'
import {
  Activity,
  Cable,
  Cloud,
  Fingerprint,
  Gauge,
  History,
  Link2,
  MapPin,
  MonitorSmartphone,
  RefreshCw,
  Settings2,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { minutesToTime, timeToMinutes } from '@/lib/attendance-hours'

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

type CloudDevice = {
  id: string
  active: boolean
  pushDeviceIdSuffix: string
  allowedSourceIp: string | null
  lastSeenAt: string | null
  lastSourceIp: string | null
  lastError: string | null
  device: {
    id: string
    name: string
    locationLabel: string | null
    purpose: string
    status: string
    lastEventAt: string | null
    active: boolean
  }
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
  const [cloudDevices, setCloudDevices] = React.useState<CloudDevice[]>([])
  const [events, setEvents] = React.useState<Array<Record<string, unknown>>>([])
  const [mappings, setMappings] = React.useState<Array<Record<string, unknown>>>([])
  const [settings, setSettings] = React.useState<Record<string, unknown> | null>(null)
  const [pairingCode, setPairingCode] = React.useState<string | null>(null)
  const [pairingName, setPairingName] = React.useState('Office Connector')
  const [mapExternalId, setMapExternalId] = React.useState('')
  const [mapSubjectType, setMapSubjectType] = React.useState<'STUDENT' | 'STAFF'>('STUDENT')
  const [mapAdmissionNo, setMapAdmissionNo] = React.useState('')
  const [mapEmployeeCode, setMapEmployeeCode] = React.useState('')
  const [cloudDeviceName, setCloudDeviceName] = React.useState('')
  const [cloudDeviceId, setCloudDeviceId] = React.useState('')
  const [cloudDevicePurpose, setCloudDevicePurpose] = React.useState<'STUDENT' | 'STAFF' | 'BOTH'>('BOTH')
  const [cloudDeviceLocation, setCloudDeviceLocation] = React.useState('')
  const [cloudEndpointUrl, setCloudEndpointUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async (next: Tab) => {
    setLoading(true)
    try {
      if (next === 'overview') setOverview(await apiGet('overview'))
      if (next === 'connectors') setConnectors(await apiGet('connectors'))
      if (next === 'devices') {
        const [registered, direct] = await Promise.all([
          apiGet('devices'),
          apiGet('cloud_devices'),
        ])
        setDevices(registered)
        setCloudDevices(direct)
      }
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

  const tabs: {
    id: Tab
    label: string
    icon: React.ComponentType<{ className?: string }>
  }[] = [
    { id: 'overview', label: 'Overview', icon: Gauge },
    { id: 'connectors', label: 'Connectors', icon: Cable },
    { id: 'devices', label: 'Devices', icon: Fingerprint },
    { id: 'mappings', label: 'User mapping', icon: UserRoundCheck },
    { id: 'events', label: 'Event logs', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings2 },
  ]

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-surface p-1 shadow-card">
        <div className="flex min-w-max items-center gap-1" role="tablist" aria-label="Biometric sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`biometric-panel-${t.id}`}
            className={`flex h-10 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 ${
              tab === t.id
                ? 'bg-[var(--product-500)] text-white shadow-sm'
                : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
            }`}
            onClick={() => setTab(t.id)}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
          </button>
        ))}
        </div>
      </div>

      {loading && <BiometricSkeleton />}

      {tab === 'overview' && overview && (
        <div
          id="biometric-panel-overview"
          role="tabpanel"
          className="space-y-5"
        >
          <section className="relative overflow-hidden rounded-[var(--radius-lg)] bg-[var(--product-700)] px-5 py-5 text-white shadow-card sm:px-6">
            <div className="absolute -right-8 -top-12 size-44 rounded-full bg-white/8" aria-hidden />
            <div className="absolute -bottom-16 right-20 size-36 rounded-full bg-cyan-300/10" aria-hidden />
            <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-[var(--radius)] bg-white/12">
                  <Fingerprint className="size-7" aria-hidden />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">Attendance network</h2>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-300/15 px-2.5 py-1 text-xs font-medium text-emerald-100">
                      <span className="size-1.5 rounded-full bg-emerald-300" aria-hidden />
                      Live
                    </span>
                  </div>
                  <p className="mt-1 max-w-[62ch] text-sm text-indigo-100">
                    Fingerprint and RFID punches flow securely from school devices into attendance.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-[var(--radius)] bg-black/12 px-4 py-3">
                <Activity className="size-5 text-emerald-300" aria-hidden />
                <div>
                  <p className="text-xs text-indigo-100">Today&apos;s activity</p>
                  <p className="text-lg font-semibold">{overview.eventsToday} punches</p>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricTile
              label="Online devices"
              value={overview.onlineDevices}
              detail="Ready to receive punches"
              icon={Wifi}
              tone="success"
            />
            <MetricTile
              label="Offline devices"
              value={overview.offlineDevices}
              detail={overview.offlineDevices > 0 ? 'Needs attention' : 'Everything is connected'}
              icon={WifiOff}
              tone={overview.offlineDevices > 0 ? 'danger' : 'neutral'}
            />
            <MetricTile
              label="Connectors"
              value={overview.connectors}
              detail="School network bridges"
              icon={Link2}
              tone="brand"
            />
            <MetricTile
              label="Events today"
              value={overview.eventsToday}
              detail="Raw punches received"
              icon={Zap}
              tone="info"
            />
            <MetricTile
              label="Unmapped users"
              value={overview.unmappedUsers}
              detail={overview.unmappedUsers > 0 ? 'Map IDs to people' : 'All users identified'}
              icon={UsersRound}
              tone={overview.unmappedUsers > 0 ? 'warning' : 'neutral'}
            />
            <MetricTile
              label="Pending process"
              value={overview.pendingSync}
              detail={overview.pendingSync > 0 ? 'Queued for attendance' : 'Queue is clear'}
              icon={RefreshCw}
              tone={overview.pendingSync > 0 ? 'warning' : 'neutral'}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <div className="rounded-[var(--radius)] border border-line bg-surface px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-info-bg text-info">
                  <ShieldCheck className="size-5" aria-hidden />
                </div>
                <div>
                  <h3 className="font-semibold text-ink">Secure by design</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Devices send attendance events only. Fingerprint templates remain on the terminal and school network.
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTab(overview.unmappedUsers > 0 ? 'mappings' : 'devices')}
              className="flex items-center justify-between gap-4 rounded-[var(--radius)] bg-[var(--product-50)] px-5 py-4 text-left text-[var(--product-700)] transition-colors hover:bg-[var(--product-100)]"
            >
              <span>
                <span className="block font-semibold">
                  {overview.unmappedUsers > 0 ? 'Resolve unmapped users' : 'Manage biometric devices'}
                </span>
                <span className="mt-1 block text-sm opacity-80">
                  {overview.unmappedUsers > 0
                    ? `${overview.unmappedUsers} device IDs need attention`
                    : 'Review connectivity and device status'}
                </span>
              </span>
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      )}

      {tab === 'connectors' && (
        <div id="biometric-panel-connectors" role="tabpanel" className="space-y-4">
          {canManage && (
            <Card variant="elevated" className="overflow-hidden">
              <CardHeader className="min-h-16 bg-[var(--product-50)]">
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-[var(--product-500)] text-white">
                    <Cable className="size-5" aria-hidden />
                  </div>
                  <div>
                    <CardTitle>Pair MyCampusView Connect</CardTitle>
                    <CardDescription>Link a Windows PC on the school network in one step.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 p-5 sm:grid-cols-[minmax(15rem,1fr)_auto] sm:items-end">
                <Field label="Connector name" hint="Use a name staff will recognize, such as Front Office PC.">
                  <Input
                    value={pairingName}
                    onChange={(e) => setPairingName(e.target.value)}
                    placeholder="Front Office PC"
                  />
                </Field>
                <Button
                  className="sm:mb-5"
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
                <CardContent className="border-t border-line bg-success-bg p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-success">Pairing code ready</p>
                      <p className="mt-0.5 text-xs text-success">Enter it in MyCampusView Connect within 30 minutes.</p>
                    </div>
                    <code className="rounded-[var(--radius-sm)] bg-surface px-4 py-2 font-mono text-lg font-semibold tracking-[0.16em] text-ink shadow-sm">
                      {pairingCode}
                    </code>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {connectors.length === 0 ? (
            <EmptyState title="No connectors yet" description="Generate a pairing code and install MyCampusView Connect on a school Windows PC." />
          ) : (
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>School connectors</CardTitle>
                  <CardDescription>{connectors.length} registered network bridge{connectors.length === 1 ? '' : 's'}</CardDescription>
                </div>
                <Badge tone={connectors.some((connector) => connector.online) ? 'success' : 'warning'} dot>
                  {connectors.filter((connector) => connector.online).length} online
                </Badge>
              </CardHeader>
              <TableWrap className="border-0 rounded-none">
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
                      <TD className="font-medium text-ink">{c.name}</TD>
                      <TD>{c.hostname ?? '—'}</TD>
                      <TD>{c.version ?? '—'}</TD>
                      <TD>{c._count.devices}</TD>
                      <TD>{c.pendingEvents}</TD>
                      <TD>{c.lastSeenAt ? DATE.format(new Date(c.lastSeenAt)) : '—'}</TD>
                      <TD>
                        <Badge tone={c.online ? 'success' : 'warning'} dot>
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
            </Card>
          )}
        </div>
      )}

      {tab === 'devices' && (
        <div id="biometric-panel-devices" role="tabpanel" className="space-y-4">
          {canManage && (
            <Card variant="elevated" className="overflow-hidden">
              <CardHeader className="min-h-16 bg-info-bg">
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-info text-white">
                    <Cloud className="size-5" aria-hidden />
                  </div>
                  <div>
                    <CardTitle>Direct internet connection</CardTitle>
                    <CardDescription>Connect a compatible terminal without keeping a local PC online.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start gap-3 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5 text-sm text-ink-muted">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                  <p>The private setup URL is shown once. Store it securely and enter it on the terminal.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Field label="Device name" className="xl:col-span-2">
                    <Input
                      value={cloudDeviceName}
                      onChange={(event) => setCloudDeviceName(event.target.value)}
                      placeholder="Main Gate RS9W"
                    />
                  </Field>
                  <Field label="Cloud ID">
                    <Input
                      value={cloudDeviceId}
                      onChange={(event) => setCloudDeviceId(event.target.value)}
                      placeholder="Shown on the RS9W"
                    />
                  </Field>
                  <Field label="Used for">
                    <Select
                      value={cloudDevicePurpose}
                      onChange={(event) =>
                        setCloudDevicePurpose(event.target.value as 'STUDENT' | 'STAFF' | 'BOTH')
                      }
                    >
                      <option value="BOTH">Students and staff</option>
                      <option value="STUDENT">Students only</option>
                      <option value="STAFF">Staff only</option>
                    </Select>
                  </Field>
                  <Field label="Location">
                    <Input
                      value={cloudDeviceLocation}
                      onChange={(event) => setCloudDeviceLocation(event.target.value)}
                      placeholder="Main gate"
                    />
                  </Field>
                </div>
                <div className="flex justify-end border-t border-line pt-4">
                  <Button
                    disabled={!cloudDeviceName.trim() || !cloudDeviceId.trim()}
                    onClick={async () => {
                      try {
                        const result = await apiPost({
                          action: 'create_cloud_device',
                          name: cloudDeviceName,
                          cloudId: cloudDeviceId,
                          purpose: cloudDevicePurpose,
                          locationLabel: cloudDeviceLocation || null,
                        })
                        setCloudEndpointUrl(result.endpointUrl)
                        setCloudDeviceName('')
                        setCloudDeviceId('')
                        setCloudDeviceLocation('')
                        toast.push({ tone: 'success', title: 'Cloud biometric device created' })
                        await load('devices')
                      } catch (error) {
                        toast.push({
                          tone: 'error',
                          title: error instanceof Error ? error.message : 'Could not create device',
                        })
                      }
                    }}
                  >
                    Create internet connection
                  </Button>
                </div>
                {cloudEndpointUrl && (
                  <div className="rounded-[var(--radius)] bg-success-bg p-4 text-success">
                    <div className="flex items-center gap-2 font-medium">
                      <ShieldCheck className="size-4" aria-hidden />
                      Private device URL created
                    </div>
                    <p className="mt-1 text-xs">Copy it now and enter it as the RS9W Web Server URL.</p>
                    <code className="mt-3 block break-all rounded-[var(--radius-sm)] bg-surface px-3 py-2 font-mono text-xs text-ink">
                      {cloudEndpointUrl}
                    </code>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {cloudDevices.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Internet-connected devices</CardTitle>
                  <CardDescription>Cloud-direct terminals and their latest contact.</CardDescription>
                </div>
                <Badge tone="info">{cloudDevices.length} cloud</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <TableWrap className="rounded-none border-0">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Device</TH>
                        <TH>Cloud ID</TH>
                        <TH>Last contact</TH>
                        <TH>Status</TH>
                        <TH />
                      </TR>
                    </THead>
                    <TBody>
                      {cloudDevices.map((endpoint) => (
                        <TR key={endpoint.id}>
                          <TD className="font-medium text-ink">
                            <span className="inline-flex items-center gap-2">
                              <Cloud className="size-4 text-info" aria-hidden />
                              {endpoint.device.name}
                            </span>
                          </TD>
                          <TD>••••{endpoint.pushDeviceIdSuffix}</TD>
                          <TD>{endpoint.lastSeenAt ? DATE.format(new Date(endpoint.lastSeenAt)) : 'Never'}</TD>
                          <TD>
                            <Badge tone={endpoint.device.status === 'ONLINE' ? 'success' : 'warning'} dot>
                              {endpoint.device.status}
                            </Badge>
                          </TD>
                          <TD className="space-x-2">
                            {canManage && (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={async () => {
                                    const result = await apiPost({
                                      action: 'rotate_cloud_device_url',
                                      endpointId: endpoint.id,
                                    })
                                    setCloudEndpointUrl(result.endpointUrl)
                                    toast.push({
                                      tone: 'success',
                                      title: 'Private device URL rotated',
                                    })
                                  }}
                                >
                                  New URL
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={async () => {
                                    const active = !endpoint.device.active
                                    await apiPost({
                                      action: 'set_device_active',
                                      deviceId: endpoint.device.id,
                                      active,
                                    })
                                    toast.push({
                                      tone: 'success',
                                      title: active ? 'Device enabled' : 'Device disabled',
                                    })
                                    await load('devices')
                                  }}
                                >
                                  {endpoint.device.active ? 'Disable' : 'Enable'}
                                </Button>
                              </>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </CardContent>
            </Card>
          )}

          {devices.length === 0 ? (
            <EmptyState
              title="No devices registered"
              description="Create an internet connection above, or pair MyCampusView Connect for a device on the school LAN."
            />
          ) : (
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Local network devices</CardTitle>
                  <CardDescription>Terminals connected through MyCampusView Connect.</CardDescription>
                </div>
                <Badge tone="brand">{devices.length} registered</Badge>
              </CardHeader>
              <TableWrap className="rounded-none border-0">
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
                      <TD className="font-medium text-ink">
                        <span className="inline-flex items-center gap-2">
                          <MonitorSmartphone className="size-4 text-[var(--product-500)]" aria-hidden />
                          {d.name}
                        </span>
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3.5 text-ink-subtle" aria-hidden />
                          {d.locationLabel ?? '—'}
                        </span>
                      </TD>
                      <TD>
                        {d.brand} {d.model}
                      </TD>
                      <TD>{d.connector.name}</TD>
                      <TD>{d.lastEventAt ? DATE.format(new Date(d.lastEventAt)) : '—'}</TD>
                      <TD>
                        <Badge tone={d.status === 'ONLINE' ? 'success' : 'warning'} dot>{d.status}</Badge>
                      </TD>
                      <TD className="space-x-2">
                        {canManage && d.connector.name !== 'MyCampusView Cloud Gateway' && (
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
            </Card>
          )}
        </div>
      )}

      {tab === 'mappings' && (
        <div id="biometric-panel-mappings" role="tabpanel" className="space-y-4">
          {canManage && (
            <Card variant="elevated" className="overflow-hidden">
              <CardHeader className="min-h-16 bg-warning-bg">
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-warning text-white">
                    <UserRoundCheck className="size-5" aria-hidden />
                  </div>
                  <div>
                    <CardTitle>Map a device user</CardTitle>
                    <CardDescription>Connect a terminal ID to the correct student or staff record.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                <Field label="Device user ID">
                  <Input value={mapExternalId} onChange={(e) => setMapExternalId(e.target.value)} placeholder="e.g. 1520" />
                </Field>
                <Field label="Map as">
                  <Select
                    value={mapSubjectType}
                    onChange={(e) => setMapSubjectType(e.target.value as 'STUDENT' | 'STAFF')}
                  >
                    <option value="STUDENT">Student</option>
                    <option value="STAFF">Staff member</option>
                  </Select>
                </Field>
                {mapSubjectType === 'STUDENT' ? (
                  <Field label="Admission No">
                    <Input
                      value={mapAdmissionNo}
                      onChange={(e) => setMapAdmissionNo(e.target.value)}
                      placeholder="e.g. ADM-2026-158"
                    />
                  </Field>
                ) : (
                  <Field label="Employee Code">
                    <Input
                      value={mapEmployeeCode}
                      onChange={(e) => setMapEmployeeCode(e.target.value)}
                      placeholder="e.g. EMP-104"
                    />
                  </Field>
                )}
                <Button
                  className="lg:col-start-4"
                  onClick={async () => {
                    try {
                      const result = await apiPost({
                        action: 'upsert_mapping',
                        externalUserId: mapExternalId,
                        subjectType: mapSubjectType,
                        ...(mapSubjectType === 'STUDENT'
                          ? { admissionNo: mapAdmissionNo }
                          : { employeeCode: mapEmployeeCode }),
                      })
                      toast.push({
                        tone: 'success',
                        title: `Mapped. Reprocessed ${result.reprocessed} events.`,
                      })
                      setMapExternalId('')
                      setMapAdmissionNo('')
                      setMapEmployeeCode('')
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
          <div className="flex items-start gap-3 rounded-[var(--radius)] bg-info-bg px-4 py-3 text-info">
            <Activity className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-sm">Unmapped IDs come directly from recent punches. Mapping one reprocesses its waiting attendance events automatically.</p>
          </div>
          {mappings.length === 0 ? (
            <EmptyState title="No unmapped users" description="All seen device user IDs are mapped, or no events have arrived yet." />
          ) : (
            <Card className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>Waiting for mapping</CardTitle>
                  <CardDescription>Device identities not yet linked to a person.</CardDescription>
                </div>
                <Badge tone="warning">{mappings.length} unresolved</Badge>
              </CardHeader>
              <TableWrap className="rounded-none border-0">
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
                      <TD className="font-mono font-medium text-ink">{String(m.externalUserId)}</TD>
                      <TD>
                        {m.lastPunchAt ? DATE.format(new Date(String(m.lastPunchAt))) : '—'}
                      </TD>
                      <TD>{String(m.eventCount ?? '—')}</TD>
                      <TD>
                        <Badge tone="warning" dot>{String(m.mappingStatus)}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
                </Table>
              </TableWrap>
            </Card>
          )}
        </div>
      )}

      {tab === 'events' && (
        events.length === 0 ? (
          <div id="biometric-panel-events" role="tabpanel">
            <EmptyState title="No biometric events yet" description="Punches from MyCampusView Connect appear here as immutable raw events." />
          </div>
        ) : (
          <Card id="biometric-panel-events" role="tabpanel" className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-success-bg text-success">
                  <Activity className="size-5" aria-hidden />
                </div>
                <div>
                  <CardTitle>Live event stream</CardTitle>
                  <CardDescription>Immutable device punches and their processing result.</CardDescription>
                </div>
              </div>
              <Badge tone="success" dot>{events.length} recent</Badge>
            </CardHeader>
            <TableWrap className="rounded-none border-0">
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
                    <TD className="whitespace-nowrap font-medium text-ink">{DATE.format(new Date(String(e.deviceLocalAt)))}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-2">
                        <Fingerprint className="size-3.5 text-[var(--product-500)]" aria-hidden />
                        {(e.device as { name?: string } | null)?.name ?? '—'}
                      </span>
                    </TD>
                    <TD className="font-mono">{String(e.externalUserId)}</TD>
                    <TD className="font-medium text-ink">{String(e.mappedPerson ?? '—')}</TD>
                    <TD>{String(e.verificationMethod)}</TD>
                    <TD>
                      <Badge tone={e.status === 'PROCESSED' ? 'success' : 'warning'} dot>
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
          </Card>
        )
      )}

      {tab === 'settings' && settings && (
        <Card id="biometric-panel-settings" role="tabpanel" variant="elevated" className="overflow-hidden">
          <CardHeader className="min-h-16 bg-[var(--product-50)]">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-[var(--product-500)] text-white">
                <Settings2 className="size-5" aria-hidden />
              </div>
              <div>
                <CardTitle>Attendance automation</CardTitle>
                <CardDescription>Choose how punches become attendance and parent updates.</CardDescription>
              </div>
            </div>
            {!canManage && <Badge tone="neutral">View only</Badge>}
          </CardHeader>
          <CardContent className="space-y-6 p-5">
            <div className="divide-y divide-line rounded-[var(--radius)] border border-line">
            {(
              [
                ['enabled', 'Enable biometric attendance', 'Accept and process events from registered devices'],
                ['studentAttendance', 'Student attendance', 'Use mapped student punches for attendance'],
                ['staffAttendance', 'Staff attendance', 'Use mapped employee punches for attendance'],
                ['notifyParentOnEntry', 'Parent entry notification', 'Notify the parent after a student enters'],
                ['notifyParentOnExit', 'Parent exit notification', 'Notify the parent after a student leaves'],
                ['requireManualConflictReview', 'Review attendance conflicts', 'Pause when a punch conflicts with a manual absent mark'],
                ['autoProcess', 'Process events automatically', 'Apply valid events immediately after they arrive'],
              ] as const
            ).map(([key, label, description]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5 hover:bg-surface-2">
                <span>
                  <span className="block text-sm font-medium text-ink">{label}</span>
                  <span className="mt-0.5 block text-xs text-ink-subtle">{description}</span>
                </span>
                <Checkbox
                  checked={Boolean(settings[key])}
                  disabled={!canManage}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                  aria-label={label}
                />
              </label>
            ))}
            </div>

            <section>
              <div className="mb-3">
                <h3 className="font-semibold text-ink">School hours</h3>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  Biometric and geofence attendance count inside this window. Guest teachers with
                  custom hours on their staff profile use their own window instead.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="School open" hint="Earliest time attendance is accepted (plus grace).">
                  <Input
                    type="time"
                    disabled={!canManage}
                    value={minutesToTime(Number(settings.schoolOpenMinutes ?? 480))}
                    onChange={(e) => {
                      const minutes = timeToMinutes(e.target.value)
                      if (minutes == null) return
                      setSettings({
                        ...settings,
                        schoolOpenMinutes: minutes,
                        staffLateAfterMinutes: settings.staffLateAfterMinutes ?? minutes,
                      })
                    }}
                  />
                </Field>
                <Field label="School close" hint="Latest time attendance is accepted (plus grace).">
                  <Input
                    type="time"
                    disabled={!canManage}
                    value={minutesToTime(Number(settings.schoolCloseMinutes ?? 840))}
                    onChange={(e) => {
                      const minutes = timeToMinutes(e.target.value)
                      if (minutes == null) return
                      setSettings({ ...settings, schoolCloseMinutes: minutes })
                    }}
                  />
                </Field>
                <Field label="Student late after" hint="First punch after this is marked Late.">
                  <Input
                    type="time"
                    disabled={!canManage}
                    value={minutesToTime(Number(settings.studentLateAfterMinutes ?? 540))}
                    onChange={(e) => {
                      const minutes = timeToMinutes(e.target.value)
                      if (minutes == null) return
                      setSettings({ ...settings, studentLateAfterMinutes: minutes })
                    }}
                  />
                </Field>
                <Field label="Staff late after" hint="For full-time staff following school hours.">
                  <Input
                    type="time"
                    disabled={!canManage}
                    value={minutesToTime(Number(settings.staffLateAfterMinutes ?? settings.schoolOpenMinutes ?? 480))}
                    onChange={(e) => {
                      const minutes = timeToMinutes(e.target.value)
                      if (minutes == null) return
                      setSettings({ ...settings, staffLateAfterMinutes: minutes })
                    }}
                  />
                </Field>
                <Field
                  label="Window grace"
                  hint="Minutes before open / after close still accepted."
                >
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      max={180}
                      disabled={!canManage}
                      className="pr-16"
                      value={Number(settings.attendanceWindowGraceMinutes ?? 30)}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          attendanceWindowGraceMinutes: Number(e.target.value),
                        })
                      }
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">
                      minutes
                    </span>
                  </div>
                </Field>
                <label className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-line px-3 py-2">
                  <span className="text-sm text-ink">
                    Only count punches inside school / staff hours
                    <span className="mt-0.5 block text-xs text-ink-subtle">
                      Outside punches are stored but skipped for attendance.
                    </span>
                  </span>
                  <Checkbox
                    checked={Boolean(settings.enforceAttendanceWindow ?? true)}
                    disabled={!canManage}
                    onChange={(e) =>
                      setSettings({ ...settings, enforceAttendanceWindow: e.target.checked })
                    }
                    aria-label="Enforce attendance window"
                  />
                </label>
              </div>
            </section>

            <section>
              <div className="mb-3">
                <h3 className="font-semibold text-ink">Timing rules</h3>
                <p className="mt-0.5 text-xs text-ink-subtle">Fine-tune duplicate detection.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Duplicate punch window" hint="Seconds during which repeat punches are ignored.">
                  <div className="relative">
                    <Input
                      type="number"
                      min={1}
                      disabled={!canManage}
                      className="pr-16"
                      value={Number(settings.duplicatePunchWindowSec ?? 30)}
                      onChange={(e) =>
                        setSettings({ ...settings, duplicatePunchWindowSec: Number(e.target.value) })
                      }
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">seconds</span>
                  </div>
                </Field>
              </div>
            </section>
            {canManage && (
              <div className="flex justify-end border-t border-line pt-4">
                <Button
                  onClick={async () => {
                    await apiPost({ action: 'save_settings', settings })
                    toast.push({ tone: 'success', title: 'Settings saved' })
                  }}
                >
                  Save attendance settings
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

type MetricTone = 'brand' | 'success' | 'danger' | 'warning' | 'info' | 'neutral'

const metricToneClasses: Record<MetricTone, { ground: string; icon: string }> = {
  brand: {
    ground: 'bg-[var(--product-50)]',
    icon: 'bg-[var(--product-100)] text-[var(--product-700)]',
  },
  success: { ground: 'bg-success-bg', icon: 'bg-surface text-success' },
  danger: { ground: 'bg-danger-bg', icon: 'bg-surface text-danger' },
  warning: { ground: 'bg-warning-bg', icon: 'bg-surface text-warning' },
  info: { ground: 'bg-info-bg', icon: 'bg-surface text-info' },
  neutral: { ground: 'bg-surface', icon: 'bg-surface-3 text-ink-muted' },
}

function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  detail: string
  icon: React.ComponentType<{ className?: string }>
  tone: MetricTone
}) {
  const colors = metricToneClasses[tone]
  return (
    <div className={`flex min-h-28 items-center gap-4 rounded-[var(--radius)] px-4 py-4 ${colors.ground}`}>
      <div className={`grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] ${colors.icon}`}>
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <strong className="text-3xl font-semibold tabular-nums text-ink">{value}</strong>
          <span className="text-sm font-medium text-ink">{label}</span>
        </div>
        <p className="mt-1 truncate text-xs text-ink-muted">{detail}</p>
      </div>
    </div>
  )
}

function BiometricSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading biometric data">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-28 rounded-[var(--radius)] bg-surface-3 motion-safe:animate-pulse" />
      ))}
    </div>
  )
}
