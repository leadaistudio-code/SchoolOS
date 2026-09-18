import { randomInt } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { audit } from '@/server/audit'
import { randomToken, sha256 } from '@/server/crypto'
import { env } from '@/lib/env'
import { createCloudBiometricDeviceSchema } from './schema'

const CLOUD_CONNECTOR_HOSTNAME = 'mycampusview-cloud-fkweb'

function normaliseCloudId(value: string) {
  return value.trim().toUpperCase()
}

// Some RS9W firmware has a small URL buffer in its real-time log uploader.
// A random 12-digit code plus the registered Cloud ID gives a rate-limited
// two-part device credential while remaining easy to enter on a numeric keypad.
function shortFkWebToken() {
  return randomInt(0, 1_000_000_000_000).toString().padStart(12, '0')
}

function endpointUrl(token: string): string | null {
  const base = env().FKWEB_PUBLIC_URL?.replace(/\/+$/, '')
  return base ? `${base}/${token}/hdata.aspx` : null
}

export async function createCloudBiometricDevice(ctx: AppContext, input: unknown) {
  ctx.require('biometric.manage')
  if (!env().FKWEB_PUBLIC_URL) {
    throw new ApiException(503, 'NOT_CONFIGURED', 'The cloud biometric gateway URL is not configured')
  }
  const data = createCloudBiometricDeviceSchema.parse(input)
  const cloudId = normaliseCloudId(data.cloudId)
  const token = shortFkWebToken()
  const localDeviceId = `cloud-${randomToken(8)}`

  try {
    const result = await ctx.db.$transaction(async (tx) => {
      let connector = await tx.deviceConnector.findFirst({
        where: { hostname: CLOUD_CONNECTOR_HOSTNAME, revokedAt: null },
        select: { id: true },
      })
      if (!connector) {
        connector = await tx.deviceConnector.create({
          data: {
            tenantId: ctx.tenant.id,
            name: 'MyCampusView Cloud Gateway',
            connectorKey: `cloud_${randomToken(16)}`,
            secretHash: sha256(randomToken(32)),
            secretPrefix: 'internal',
            status: 'ONLINE',
            enabled: true,
            version: 'cloud-fkweb-1',
            hostname: CLOUD_CONNECTOR_HOSTNAME,
            osInfo: 'Railway cloud receiver',
            pairedAt: new Date(),
            lastSeenAt: new Date(),
            createdById: ctx.user.userId,
          },
          select: { id: true },
        })
      }

      const device = await tx.biometricDevice.create({
        data: {
          tenantId: ctx.tenant.id,
          connectorId: connector.id,
          name: data.name,
          brand: 'Realtime',
          model: 'RS9W',
          locationLabel: data.locationLabel ?? null,
          purpose: data.purpose,
          localDeviceId,
          machineNumber: `Cloud ID ending ${cloudId.slice(-4)}`,
          status: 'OFFLINE',
          syncEnabled: true,
          active: true,
          configJson: { connectionMode: 'CLOUD_FKWEB' },
        },
        select: { id: true, name: true, localDeviceId: true },
      })

      const endpoint = await tx.cloudBiometricEndpoint.create({
        data: {
          tenantId: ctx.tenant.id,
          deviceId: device.id,
          ingestTokenHash: sha256(token),
          ingestTokenPrefix: token.slice(0, 10),
          pushDeviceIdHash: sha256(cloudId),
          pushDeviceIdSuffix: cloudId.slice(-4),
          createdById: ctx.user.userId,
        },
        select: { id: true },
      })
      return { connector, device, endpoint }
    })

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'biometric.cloud_device.create',
      module: 'biometric',
      entityType: 'CloudBiometricEndpoint',
      entityId: result.endpoint.id,
      summary: `Created cloud-direct biometric device ${result.device.name}`,
      after: { deviceId: result.device.id, cloudIdSuffix: cloudId.slice(-4) },
    })

    return {
      ...result.device,
      endpointId: result.endpoint.id,
      endpointUrl: endpointUrl(token),
      tokenShownOnce: true,
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiException(409, 'CONFLICT', 'That biometric Cloud ID is already registered')
    }
    throw error
  }
}

export async function listCloudBiometricDevices(ctx: AppContext) {
  ctx.require('biometric.view')
  return ctx.db.cloudBiometricEndpoint.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      active: true,
      pushDeviceIdSuffix: true,
      ingestTokenPrefix: true,
      allowedSourceIp: true,
      lastSeenAt: true,
      lastSourceIp: true,
      lastError: true,
      createdAt: true,
      device: {
        select: {
          id: true,
          name: true,
          locationLabel: true,
          purpose: true,
          status: true,
          lastEventAt: true,
          active: true,
        },
      },
    },
  })
}

export async function rotateCloudBiometricEndpoint(ctx: AppContext, endpointId: string) {
  ctx.require('biometric.manage')
  const token = shortFkWebToken()
  const existing = await ctx.db.cloudBiometricEndpoint.findFirst({
    where: { id: endpointId },
    select: { id: true, device: { select: { name: true } } },
  })
  if (!existing) throw new ApiException(404, 'NOT_FOUND', 'Cloud biometric endpoint not found')

  await ctx.db.cloudBiometricEndpoint.update({
    where: { id: endpointId },
    data: {
      ingestTokenHash: sha256(token),
      ingestTokenPrefix: token.slice(0, 10),
      lastError: null,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'biometric.cloud_device.rotate',
    module: 'biometric',
    entityType: 'CloudBiometricEndpoint',
    entityId: endpointId,
    summary: `Rotated cloud URL for ${existing.device.name}`,
  })

  return { endpointId, endpointUrl: endpointUrl(token), tokenShownOnce: true }
}
