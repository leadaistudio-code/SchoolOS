import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { randomToken, sha256 } from '@/server/crypto'
import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { conflict } from '@/server/api/response'
import { newConnectorSecret } from './auth'
import { getOrCreateIntegration } from './settings'
import {
  PAIRING_CODE_TTL_MINUTES,
  createPairingSchema,
  normalisePairingCode,
  pairRequestSchema,
} from './schema'

function formatPairingCode(): string {
  const raw = randomToken(12).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12)
  const padded = (raw + 'XXXXXXXXXXXX').slice(0, 12)
  return `MCVT-${padded.slice(0, 4)}-${padded.slice(4, 8)}`
}

export async function createTallyPairingCode(ctx: AppContext, input: unknown) {
  ctx.require('settings.integrations')
  await getOrCreateIntegration(ctx)
  const data = createPairingSchema.parse(input)
  const display = formatPairingCode()
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000)

  const row = await ctx.db.tallyPairingCode.create({
    data: {
      tenantId: ctx.tenant.id,
      codeHash: sha256(normalisePairingCode(display)),
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
    action: 'tally.pairing.create',
    module: 'fees',
    entityType: 'TallyPairingCode',
    entityId: row.id,
    summary: `Created Tally connector pairing code for ${data.connectorName}`,
  })

  return row
}

export async function listTallyPairingCodes(ctx: AppContext) {
  ctx.require('settings.integrations')
  return ctx.db.tallyPairingCode.findMany({
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

export async function listTallyConnectors(ctx: AppContext) {
  if (!ctx.canAny('fees.tally', 'settings.integrations')) ctx.require('fees.tally')
  return ctx.db.tallyConnector.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      connectorKey: true,
      status: true,
      enabled: true,
      version: true,
      hostname: true,
      tallyHost: true,
      tallyPort: true,
      lastSeenAt: true,
      pendingJobs: true,
      pairedAt: true,
      secretPrefix: true,
    },
  })
}

export async function revokeTallyConnector(ctx: AppContext, connectorId: string) {
  ctx.require('settings.integrations')
  const row = await ctx.db.tallyConnector.update({
    where: { id: connectorId },
    data: {
      revokedAt: new Date(),
      enabled: false,
      status: 'REVOKED',
      // Rotate hash so old bearer can never authenticate
      secretHash: sha256(`revoked:${randomToken(16)}`),
    },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'tally.connector.revoke',
    module: 'fees',
    entityType: 'TallyConnector',
    entityId: row.id,
    summary: `Revoked Tally connector ${row.name}`,
  })
  return { ok: true }
}

/** Machine endpoint: exchange pairing code for long-lived connector secret (once). */
export async function pairTallyConnector(input: unknown) {
  const data = pairRequestSchema.parse(input)
  const codeHash = sha256(normalisePairingCode(data.code))

  const pairing = await prisma.tallyPairingCode.findFirst({
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

  const integration = await prisma.tallyIntegration.findUnique({
    where: { tenantId: pairing.tenantId },
    select: { id: true },
  })
  if (!integration) throw conflict('Tally integration is not configured for this school')

  const connectorKey = `tally_${randomToken(12)}`
  const { secret, hash, prefix } = newConnectorSecret()
  const db = tenantDb(pairing.tenantId)

  const connector = await db.$transaction(async (tx) => {
    const used = await tx.tallyPairingCode.updateMany({
      where: { id: pairing.id, usedAt: null },
      data: { usedAt: new Date() },
    })
    if (used.count !== 1) throw conflict('That pairing code was already used')

    const row = await tx.tallyConnector.create({
      data: {
        tenantId: pairing.tenantId,
        integrationId: integration.id,
        name: data.name ?? pairing.connectorName ?? 'Tally Connector',
        connectorKey,
        secretHash: hash,
        secretPrefix: prefix,
        status: 'ONLINE',
        enabled: true,
        version: data.connectorVersion ?? null,
        hostname: data.hostname ?? null,
        osInfo: data.osInfo ?? null,
        tallyHost: data.tallyHost ?? '127.0.0.1',
        tallyPort: data.tallyPort ?? 9000,
        pairedAt: new Date(),
        lastSeenAt: new Date(),
      },
    })

    await tx.tallyPairingCode.update({
      where: { id: pairing.id },
      data: { usedByConnectorId: row.id },
    })

    return row
  })

  return {
    connectorId: connector.id,
    connectorKey: connector.connectorKey,
    secret,
    tenantId: pairing.tenantId,
    tallyHost: connector.tallyHost,
    tallyPort: connector.tallyPort,
  }
}
