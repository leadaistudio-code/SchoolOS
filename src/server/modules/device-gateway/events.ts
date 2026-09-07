import { Prisma } from '@prisma/client'
import { tenantDb } from '@/server/db/tenant-client'
import type { ConnectorAuth } from './auth'
import { touchConnector } from './auth'
import { eventBatchSchema } from './schema'
import { processRawEvent } from './process-attendance'
import { loadBiometricSettings } from './settings'

function buildDedupeKey(input: {
  localDeviceId: string
  externalUserId: string
  deviceLocalAt: string
  direction: string
  deviceEventId?: string | null
  dedupeKey?: string
}): string {
  if (input.dedupeKey?.trim()) return input.dedupeKey.trim().slice(0, 240)
  if (input.deviceEventId?.trim()) {
    return `${input.localDeviceId}:${input.deviceEventId.trim()}`.slice(0, 240)
  }
  return [
    input.localDeviceId,
    input.externalUserId,
    input.deviceLocalAt,
    input.direction,
  ]
    .join('|')
    .slice(0, 240)
}

export async function ingestEventBatch(auth: ConnectorAuth, body: unknown) {
  const data = eventBatchSchema.parse(body)
  const db = tenantDb(auth.tenantId)
  const settings = await loadBiometricSettings(auth.tenantId)

  const localIds = [...new Set(data.events.map((e) => e.localDeviceId))]
  const devices = await db.biometricDevice.findMany({
    where: { connectorId: auth.connectorId, localDeviceId: { in: localIds }, active: true },
    select: {
      id: true,
      localDeviceId: true,
      purpose: true,
      syncEnabled: true,
      status: true,
    },
  })
  const byLocal = new Map(devices.map((d) => [d.localDeviceId, d]))

  const results: Array<{
    dedupeKey: string
    outcome: 'accepted' | 'duplicate' | 'rejected'
    eventId?: string
    error?: string
  }> = []

  for (const event of data.events) {
    const dedupeKey = buildDedupeKey(event)
    const device = byLocal.get(event.localDeviceId)
    if (!device) {
      results.push({
        dedupeKey,
        outcome: 'rejected',
        error: 'Unknown or inactive device for this connector',
      })
      continue
    }
    if (!device.syncEnabled || device.purpose === 'ACCESS_ONLY') {
      results.push({
        dedupeKey,
        outcome: 'rejected',
        error: 'Device sync disabled or access-only',
      })
      continue
    }

    const deviceLocalAt = new Date(event.deviceLocalAt)
    if (Number.isNaN(deviceLocalAt.getTime())) {
      results.push({ dedupeKey, outcome: 'rejected', error: 'Invalid deviceLocalAt' })
      continue
    }

    try {
      const created = await db.deviceRawEvent.create({
        data: {
          tenantId: auth.tenantId,
          connectorId: auth.connectorId,
          deviceId: device.id,
          externalUserId: event.externalUserId.trim(),
          dedupeKey,
          deviceEventId: event.deviceEventId ?? null,
          deviceLocalAt,
          verificationMethod: event.verificationMethod,
          direction: event.direction,
          rawPayload: (event.rawPayload ?? undefined) as Prisma.InputJsonValue | undefined,
          status: 'PENDING',
        },
        select: { id: true },
      })

      await db.biometricDevice.update({
        where: { id: device.id },
        data: { lastEventAt: deviceLocalAt, lastSyncAt: new Date(), status: 'ONLINE', lastError: null },
      })

      if (settings.autoProcess) {
        await processRawEvent(auth.tenantId, created.id)
      }

      results.push({ dedupeKey, outcome: 'accepted', eventId: created.id })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        results.push({ dedupeKey, outcome: 'duplicate' })
        continue
      }
      results.push({
        dedupeKey,
        outcome: 'rejected',
        error: err instanceof Error ? err.message : 'Store failed',
      })
    }
  }

  await touchConnector(auth.tenantId, auth.connectorId, {})

  return {
    accepted: results.filter((r) => r.outcome === 'accepted').length,
    duplicate: results.filter((r) => r.outcome === 'duplicate').length,
    rejected: results.filter((r) => r.outcome === 'rejected').length,
    results,
  }
}
