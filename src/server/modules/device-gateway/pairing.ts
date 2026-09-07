import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { randomToken, sha256 } from '@/server/crypto'
import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { conflict, notFound } from '@/server/api/response'
import { PAIRING_CODE_TTL_MINUTES, TOKEN_PREFIX, createPairingSchema, pairRequestSchema } from './schema'

function formatPairingCode(raw: string): string {
  const compact = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12)
  const padded = (compact + randomToken(8).replace(/[^A-Z0-9]/gi, '').toUpperCase()).slice(0, 12)
  return `MCV-${padded.slice(0, 4)}-${padded.slice(4, 8)}`
}

function normaliseCode(code: string): string {
  return code.replace(/[^A-Z0-9]/gi, '').toUpperCase()
}

export async function createPairingCode(ctx: AppContext, input: unknown) {
  ctx.require('biometric.manage')
  const data = createPairingSchema.parse(input)
  const display = formatPairingCode(randomToken(12))
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000)

  const row = await ctx.db.devicePairingCode.create({
    data: {
      tenantId: ctx.tenant.id,
      codeHash: sha256(normaliseCode(display)),
      codeDisplay: display,
      connectorName: data.connectorName,
      expiresAt,
      createdById: ctx.user.userId,
    },
    select: {
      id: true,
      codeDisplay: true,
      connectorName: true,
      expiresAt: true,
      createdAt: true,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'biometric.pairing.create',
    module: 'biometric',
    entityType: 'DevicePairingCode',
    entityId: row.id,
    summary: `Created Connect pairing code for ${data.connectorName}`,
  })

  return row
}

export async function listPairingCodes(ctx: AppContext) {
  ctx.require('biometric.view')
  return ctx.db.devicePairingCode.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      codeDisplay: true,
      connectorName: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  })
}

/**
 * Machine endpoint: exchange a short-lived pairing code for a long-lived
 * connector credential. The plaintext secret is returned once.
 */
export async function pairConnector(input: unknown) {
  const data = pairRequestSchema.parse(input)
  const codeHash = sha256(normaliseCode(data.code))

  const pairing = await prisma.devicePairingCode.findFirst({
    where: { codeHash },
    select: {
      id: true,
      tenantId: true,
      connectorName: true,
      expiresAt: true,
      usedAt: true,
    },
  })

  if (!pairing || pairing.usedAt || pairing.expiresAt.getTime() < Date.now()) {
    throw conflict('That pairing code is invalid, used, or expired')
  }

  const connectorKey = `conn_${randomToken(12)}`
  const secret = `${TOKEN_PREFIX}${randomToken(24)}`
  const db = tenantDb(pairing.tenantId)

  const connector = await db.$transaction(async (tx) => {
    const created = await tx.deviceConnector.create({
      data: {
        tenantId: pairing.tenantId,
        name: data.name?.trim() || pairing.connectorName || 'Office Connector',
        connectorKey,
        secretHash: sha256(secret),
        secretPrefix: secret.slice(0, TOKEN_PREFIX.length + 6),
        status: 'ONLINE',
        version: data.connectorVersion ?? null,
        hostname: data.hostname ?? null,
        osInfo: data.osInfo ?? null,
        pairedAt: new Date(),
        lastSeenAt: new Date(),
      },
      select: { id: true, name: true, connectorKey: true, tenantId: true },
    })

    const used = await tx.devicePairingCode.updateMany({
      where: { id: pairing.id, usedAt: null },
      data: { usedAt: new Date(), usedByConnectorId: created.id },
    })
    if (used.count !== 1) {
      throw conflict('That pairing code was already used')
    }

    return created
  })

  await audit({
    tenantId: pairing.tenantId,
    action: 'biometric.connector.pair',
    module: 'biometric',
    entityType: 'DeviceConnector',
    entityId: connector.id,
    summary: `Paired MyCampusView Connect (${connector.name})`,
    after: { hostname: data.hostname, version: data.connectorVersion },
  })

  const tenant = await prisma.tenant.findFirst({
    where: { id: pairing.tenantId },
    select: { id: true, name: true, slug: true, timezone: true },
  })

  return {
    connectorId: connector.id,
    connectorKey: connector.connectorKey,
    connectorSecret: secret,
    connectorName: connector.name,
    tenant: tenant!,
  }
}

export async function revokeConnector(ctx: AppContext, id: string) {
  ctx.require('biometric.manage')
  const existing = await ctx.db.deviceConnector.findFirst({
    where: { id },
    select: { id: true, name: true, revokedAt: true },
  })
  if (!existing) throw notFound('Connector not found')
  if (existing.revokedAt) return existing

  const updated = await ctx.db.deviceConnector.update({
    where: { id },
    data: { revokedAt: new Date(), status: 'REVOKED', enabled: false },
    select: { id: true, name: true, revokedAt: true, status: true },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'biometric.connector.revoke',
    module: 'biometric',
    entityType: 'DeviceConnector',
    entityId: id,
    summary: `Revoked Connect connector ${existing.name}`,
  })

  return updated
}
