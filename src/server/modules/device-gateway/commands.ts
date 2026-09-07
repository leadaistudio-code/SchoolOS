import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { tenantDb } from '@/server/db/tenant-client'
import { notFound } from '@/server/api/response'
import type { ConnectorAuth } from './auth'
import { commandResultSchema } from './schema'
import type { DeviceCommandType } from '@prisma/client'

export async function enqueueCommand(
  ctx: AppContext,
  input: {
    connectorId: string
    deviceId?: string | null
    type: DeviceCommandType
    payload?: Record<string, unknown>
  },
) {
  ctx.require('biometric.manage')

  const connector = await ctx.db.deviceConnector.findFirst({
    where: { id: input.connectorId, revokedAt: null, enabled: true },
    select: { id: true, name: true },
  })
  if (!connector) throw notFound('Connector not found')

  if (input.deviceId) {
    const device = await ctx.db.biometricDevice.findFirst({
      where: { id: input.deviceId, connectorId: input.connectorId },
      select: { id: true },
    })
    if (!device) throw notFound('Device not found on that connector')
  }

  const row = await ctx.db.deviceCommand.create({
    data: {
      tenantId: ctx.tenant.id,
      connectorId: input.connectorId,
      deviceId: input.deviceId ?? null,
      type: input.type,
      payload: input.payload ?? undefined,
      status: 'PENDING',
      createdById: ctx.user.userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'biometric.command.enqueue',
    module: 'biometric',
    entityType: 'DeviceCommand',
    entityId: row.id,
    summary: `Queued ${input.type} for connector ${connector.name}`,
  })

  return row
}

export async function claimPendingCommands(auth: ConnectorAuth) {
  const db = tenantDb(auth.tenantId)
  const now = new Date()

  await db.deviceCommand.updateMany({
    where: {
      connectorId: auth.connectorId,
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    data: { status: 'EXPIRED' },
  })

  const pending = await db.deviceCommand.findMany({
    where: {
      connectorId: auth.connectorId,
      status: 'PENDING',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: {
      id: true,
      type: true,
      payload: true,
      deviceId: true,
      createdAt: true,
      device: { select: { localDeviceId: true, name: true } },
    },
  })

  if (pending.length) {
    await db.deviceCommand.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: 'CLAIMED', claimedAt: now },
    })
  }

  return pending.map((p) => ({
    id: p.id,
    type: p.type,
    payload: p.payload,
    deviceId: p.deviceId,
    localDeviceId: p.device?.localDeviceId ?? null,
    deviceName: p.device?.name ?? null,
    createdAt: p.createdAt,
  }))
}

export async function reportCommandResult(auth: ConnectorAuth, commandId: string, body: unknown) {
  const data = commandResultSchema.parse(body)
  const db = tenantDb(auth.tenantId)

  const cmd = await db.deviceCommand.findFirst({
    where: { id: commandId, connectorId: auth.connectorId },
    select: { id: true, status: true, deviceId: true, type: true },
  })
  if (!cmd) throw notFound('Command not found')

  const updated = await db.deviceCommand.update({
    where: { id: commandId },
    data: {
      status: data.status,
      resultJson: data.result ?? undefined,
      error: data.error ?? null,
      completedAt: new Date(),
    },
  })

  if (cmd.deviceId && data.status === 'SUCCEEDED' && cmd.type === 'TEST_CONNECTION') {
    await db.biometricDevice.update({
      where: { id: cmd.deviceId },
      data: {
        status: 'ONLINE',
        lastConnectedAt: new Date(),
        lastError: null,
        ...(typeof data.result?.serialNumber === 'string'
          ? { serialNumber: data.result.serialNumber }
          : {}),
        ...(typeof data.result?.firmware === 'string' ? { firmware: data.result.firmware } : {}),
        ...(typeof data.result?.userCount === 'number' ? { userCount: data.result.userCount } : {}),
      },
    })
  }

  return { id: updated.id, status: updated.status }
}
