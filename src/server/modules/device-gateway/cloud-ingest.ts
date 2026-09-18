import { z } from 'zod'
import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { sha256, timingSafeEqual } from '@/server/crypto'
import { ingestEventBatch } from './events'
import type { ConnectorAuth } from './auth'

const cloudPacketSchema = z.object({
  token: z.string().min(10).max(200),
  deviceId: z.string().trim().min(1).max(120),
  sourceIp: z.string().trim().min(1).max(128),
  protocol: z.enum(['EBKN_FKWEB', 'FKDATA_HS102']),
  kind: z.enum(['attendance', 'heartbeat', 'enrollment', 'command_poll', 'command_result']),
  transactionId: z.string().max(120).optional().nullable(),
  requestCode: z.string().max(120).optional().nullable(),
  commandId: z.string().max(120).optional().nullable(),
  event: z
    .object({
      externalUserId: z.string().trim().min(1).max(120),
      ioTime: z.string().trim().min(4).max(80),
      ioMode: z.string().max(80).optional().nullable(),
      verifyMode: z.string().max(80).optional().nullable(),
      deviceEventId: z.string().max(160).optional().nullable(),
      packetHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional()
    .nullable(),
})

function normaliseCloudId(value: string) {
  return value.trim().toUpperCase()
}

function normaliseExternalUserId(value: string) {
  const trimmed = value.trim()
  const unpadded = trimmed.replace(/^0+(?=\d)/, '')
  return unpadded || '0'
}

function direction(value: string | null | undefined): 'IN' | 'OUT' | 'UNKNOWN' {
  const normalised = value?.trim().toUpperCase()
  if (normalised === 'IN' || normalised === 'CHECKIN' || normalised === 'CHECK_IN' ||
      normalised === '0' || normalised === '16777216') return 'IN'
  if (normalised === 'OUT' || normalised === 'CHECKOUT' || normalised === 'CHECK_OUT' ||
      normalised === '1' || normalised === '33554432') return 'OUT'
  return 'UNKNOWN'
}

function verification(value: string | null | undefined): 'FINGERPRINT' | 'RFID' | 'PIN' | 'FACE' | 'UNKNOWN' {
  const normalised = value?.trim().toUpperCase() ?? ''
  if (normalised.includes('FINGER')) return 'FINGERPRINT'
  if (normalised.includes('CARD') || normalised.includes('RFID')) return 'RFID'
  if (normalised.includes('FACE')) return 'FACE'
  if (normalised.includes('PIN') || normalised.includes('PASSWORD')) return 'PIN'
  return 'UNKNOWN'
}

function localPartsAt(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

/** Convert a terminal wall-clock value into an instant using the tenant timezone. */
export function parseFkWebDeviceTime(value: string, timeZone: string): Date | null {
  const trimmed = value.trim()
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const explicit = new Date(trimmed)
    return Number.isNaN(explicit.getTime()) ? null : explicit
  }

  const match =
    /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(trimmed) ??
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(trimmed)
  if (!match) return null

  const target = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  }
  const targetAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  )

  try {
    let instant = targetAsUtc
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const local = localPartsAt(instant, timeZone)
      const representedAsUtc = Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
        local.second,
      )
      instant += targetAsUtc - representedAsUtc
    }
    const result = new Date(instant)
    return Number.isNaN(result.getTime()) ? null : result
  } catch {
    return null
  }
}

export async function ingestCloudFkWebPacket(input: unknown) {
  const packet = cloudPacketSchema.parse(input)
  const tokenHash = sha256(packet.token)
  const endpoint = await prisma.cloudBiometricEndpoint.findFirst({
    where: { ingestTokenHash: tokenHash },
    select: {
      id: true,
      tenantId: true,
      active: true,
      pushDeviceIdHash: true,
      allowedSourceIp: true,
      device: {
        select: {
          id: true,
          connectorId: true,
          localDeviceId: true,
          active: true,
          syncEnabled: true,
          purpose: true,
          connector: {
            select: {
              id: true,
              connectorKey: true,
              enabled: true,
              revokedAt: true,
            },
          },
        },
      },
    },
  })
  if (!endpoint || !endpoint.active) return { ok: false as const, status: 401, error: 'Unknown endpoint token' }

  const suppliedDeviceHash = sha256(normaliseCloudId(packet.deviceId))
  if (!timingSafeEqual(endpoint.pushDeviceIdHash, suppliedDeviceHash)) {
    return { ok: false as const, status: 403, error: 'Device identity does not match endpoint' }
  }
  if (endpoint.allowedSourceIp && endpoint.allowedSourceIp !== packet.sourceIp) {
    return { ok: false as const, status: 403, error: 'Device source IP is not allowed' }
  }
  if (
    !endpoint.device.active ||
    !endpoint.device.syncEnabled ||
    endpoint.device.purpose === 'ACCESS_ONLY' ||
    !endpoint.device.connector.enabled ||
    endpoint.device.connector.revokedAt
  ) {
    return { ok: false as const, status: 403, error: 'Cloud biometric device is disabled' }
  }

  const db = tenantDb(endpoint.tenantId)
  const tenant = await prisma.tenant.findFirst({
    where: { id: endpoint.tenantId },
    select: { timezone: true },
  })

  const now = new Date()
  await Promise.all([
    db.cloudBiometricEndpoint.update({
      where: { id: endpoint.id },
      data: { lastSeenAt: now, lastSourceIp: packet.sourceIp, lastError: null },
    }),
    db.biometricDevice.update({
      where: { id: endpoint.device.id },
      data: {
        status: 'ONLINE',
        lastConnectedAt: now,
        lastSyncAt: now,
        lastError: null,
      },
    }),
  ])

  if (packet.kind !== 'attendance') {
    return { ok: true as const, outcome: 'acknowledged' as const }
  }
  if (!packet.event) {
    return { ok: false as const, status: 422, error: 'Attendance packet is missing event data' }
  }

  const deviceLocalAt = parseFkWebDeviceTime(packet.event.ioTime, tenant?.timezone || 'Asia/Kolkata')
  if (!deviceLocalAt) {
    await db.cloudBiometricEndpoint.update({
      where: { id: endpoint.id },
      data: { lastError: `Unsupported device time: ${packet.event.ioTime}` },
    })
    return { ok: false as const, status: 422, error: 'Unsupported device time' }
  }

  const auth: ConnectorAuth = {
    tenantId: endpoint.tenantId,
    connectorId: endpoint.device.connectorId,
    connectorKey: endpoint.device.connector.connectorKey,
  }
  const result = await ingestEventBatch(
    auth,
    {
      events: [
        {
          localDeviceId: endpoint.device.localDeviceId,
          externalUserId: normaliseExternalUserId(packet.event.externalUserId),
          deviceLocalAt: deviceLocalAt.toISOString(),
          verificationMethod: verification(packet.event.verifyMode),
          direction: direction(packet.event.ioMode),
          deviceEventId: packet.event.deviceEventId || undefined,
          dedupeKey: `cloud:${packet.event.packetHash}`,
          rawPayload: {
            protocol: packet.protocol,
            requestCode: packet.requestCode,
            commandId: packet.commandId,
            transactionId: packet.transactionId,
            ioMode: packet.event.ioMode,
            verifyMode: packet.event.verifyMode,
          },
        },
      ],
    },
    { processSynchronously: false },
  )
  const item = result.results[0]
  if (!item || item.outcome === 'rejected') {
    const error = item?.error || 'Event was rejected'
    await db.cloudBiometricEndpoint.update({
      where: { id: endpoint.id },
      data: { lastError: error.slice(0, 500) },
    })
    return { ok: false as const, status: 422, error }
  }

  return {
    ok: true as const,
    outcome: item.outcome,
    eventId: item.eventId,
    processing:
      item.outcome === 'accepted' && item.eventId
        ? { tenantId: endpoint.tenantId, eventId: item.eventId }
        : null,
  }
}
