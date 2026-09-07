import type { AppContext } from '@/server/context'
import { tenantDb } from '@/server/db/tenant-client'
import { encryptSecret } from '@/server/crypto'
import { notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import type { ConnectorAuth } from './auth'
import { isConnectorOnline, touchConnector } from './auth'
import { deviceUpsertSchema, heartbeatSchema } from './schema'

export async function recordHeartbeat(auth: ConnectorAuth, input: unknown) {
  const data = heartbeatSchema.parse(input)
  await touchConnector(auth.tenantId, auth.connectorId, {
    version: data.connectorVersion,
    hostname: data.hostname,
    osInfo: data.osInfo,
    pendingEvents: data.pendingEvents,
  })
  return { ok: true as const, serverTime: new Date().toISOString() }
}

export async function upsertDeviceFromConnector(auth: ConnectorAuth, input: unknown) {
  const data = deviceUpsertSchema.parse(input)
  const db = tenantDb(auth.tenantId)

  const connector = await db.deviceConnector.findFirst({
    where: { id: auth.connectorId, revokedAt: null, enabled: true },
    select: { id: true },
  })
  if (!connector) throw notFound('Connector not found')

  const existing = await db.biometricDevice.findFirst({
    where: {
      connectorId: auth.connectorId,
      localDeviceId: data.localDeviceId,
    },
    select: { id: true },
  })

  const secretEnc =
    data.connectionPassword && data.connectionPassword.length > 0
      ? encryptSecret(data.connectionPassword)
      : undefined

  const row = existing
    ? await db.biometricDevice.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          brand: data.brand,
          model: data.model,
          locationLabel: data.locationLabel ?? null,
          purpose: data.purpose,
          serialNumber: data.serialNumber ?? null,
          machineNumber: data.machineNumber ?? null,
          networkAddress: data.networkAddress ?? null,
          port: data.port ?? null,
          ...(secretEnc !== undefined ? { connectionSecretEnc: secretEnc } : {}),
          firmware: data.firmware ?? null,
          userCount: data.userCount ?? null,
          status: data.status ?? 'ONLINE',
          lastError: data.lastError ?? null,
          clockDriftSec: data.clockDriftSec ?? null,
          syncEnabled: data.syncEnabled ?? true,
          lastConnectedAt: new Date(),
        },
      })
    : await db.biometricDevice.create({
        data: {
          tenantId: auth.tenantId,
          connectorId: auth.connectorId,
          localDeviceId: data.localDeviceId,
          name: data.name,
          brand: data.brand,
          model: data.model,
          locationLabel: data.locationLabel ?? null,
          purpose: data.purpose,
          serialNumber: data.serialNumber ?? null,
          machineNumber: data.machineNumber ?? null,
          networkAddress: data.networkAddress ?? null,
          port: data.port ?? null,
          connectionSecretEnc: secretEnc ?? null,
          firmware: data.firmware ?? null,
          userCount: data.userCount ?? null,
          status: data.status ?? 'ONLINE',
          lastError: data.lastError ?? null,
          clockDriftSec: data.clockDriftSec ?? null,
          syncEnabled: data.syncEnabled ?? true,
          lastConnectedAt: new Date(),
        },
      })

  await touchConnector(auth.tenantId, auth.connectorId, {})

  return {
    id: row.id,
    localDeviceId: row.localDeviceId,
    name: row.name,
    status: row.status,
  }
}

export async function listConnectors(ctx: AppContext) {
  ctx.require('biometric.view')
  const rows = await ctx.db.deviceConnector.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      connectorKey: true,
      secretPrefix: true,
      status: true,
      enabled: true,
      version: true,
      hostname: true,
      osInfo: true,
      pendingEvents: true,
      lastSeenAt: true,
      pairedAt: true,
      revokedAt: true,
      createdAt: true,
      _count: { select: { devices: true } },
    },
  })

  return rows.map((r) => ({
    ...r,
    online: !r.revokedAt && r.enabled && isConnectorOnline(r.lastSeenAt),
  }))
}

export async function listDevices(ctx: AppContext) {
  ctx.require('biometric.view')
  const rows = await ctx.db.biometricDevice.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      brand: true,
      model: true,
      locationLabel: true,
      purpose: true,
      serialNumber: true,
      networkAddress: true,
      port: true,
      status: true,
      syncEnabled: true,
      active: true,
      lastConnectedAt: true,
      lastEventAt: true,
      lastSyncAt: true,
      lastError: true,
      clockDriftSec: true,
      firmware: true,
      userCount: true,
      connectorId: true,
      connector: { select: { id: true, name: true, lastSeenAt: true, status: true } },
    },
  })
  return rows
}

export async function getDevice(ctx: AppContext, id: string) {
  ctx.require('biometric.view')
  const row = await ctx.db.biometricDevice.findFirst({
    where: { id },
    include: {
      connector: { select: { id: true, name: true, hostname: true, version: true, lastSeenAt: true, status: true } },
      _count: { select: { events: true, mappings: true } },
    },
  })
  if (!row) throw notFound('Device not found')
  const { connectionSecretEnc: _, ...safe } = row
  return safe
}

export async function setDeviceActive(ctx: AppContext, id: string, active: boolean) {
  ctx.require('biometric.manage')
  const existing = await ctx.db.biometricDevice.findFirst({ where: { id }, select: { id: true, name: true } })
  if (!existing) throw notFound('Device not found')

  const updated = await ctx.db.biometricDevice.update({
    where: { id },
    data: {
      active,
      status: active ? undefined : 'DISABLED',
      syncEnabled: active,
    },
    select: { id: true, name: true, active: true, status: true, syncEnabled: true },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: active ? 'biometric.device.enable' : 'biometric.device.disable',
    module: 'biometric',
    entityType: 'BiometricDevice',
    entityId: id,
    summary: `${active ? 'Enabled' : 'Disabled'} biometric device ${existing.name}`,
  })

  return updated
}

export async function overview(ctx: AppContext) {
  ctx.require('biometric.view')
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)

  const [connectors, devices, eventsToday, unmapped, pending] = await Promise.all([
    ctx.db.deviceConnector.count({ where: { revokedAt: null, enabled: true } }),
    ctx.db.biometricDevice.findMany({
      where: { active: true },
      select: { status: true, connector: { select: { lastSeenAt: true } } },
    }),
    ctx.db.deviceRawEvent.count({ where: { receivedAt: { gte: start } } }),
    ctx.db.deviceRawEvent.count({ where: { status: 'UNMAPPED' } }),
    ctx.db.deviceRawEvent.count({ where: { status: 'PENDING' } }),
  ])

  const onlineDevices = devices.filter((d) => d.status === 'ONLINE').length
  const offlineDevices = devices.length - onlineDevices

  return {
    connectors,
    onlineDevices,
    offlineDevices,
    eventsToday,
    unmappedUsers: unmapped,
    pendingSync: pending,
  }
}
