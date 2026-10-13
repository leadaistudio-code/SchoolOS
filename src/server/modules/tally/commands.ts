import type { AppContext } from '@/server/context'
import type { TallyCommandType } from '@prisma/client'
import { notFound } from '@/server/api/response'
import { auditTally, writeTallySyncLog } from './logging'
import type { TallyConnectorAuth } from './auth'
import { tenantDb } from '@/server/db/tenant-client'
import { getOrCreateIntegration } from './settings'
import { commandResultSchema } from './schema'
import { cleanTallyName } from '@/server/integrations/tally/xml'

export async function enqueueTallyCommand(
  ctx: AppContext,
  input: {
    type: TallyCommandType
    payload?: Record<string, unknown>
    idempotencyKey?: string | null
    connectorId?: string | null
  },
) {
  if (!ctx.canAny('fees.tally_manage', 'settings.integrations')) ctx.require('fees.tally_manage')
  const integration = await getOrCreateIntegration(ctx)
  const companyName = cleanTallyName(integration.companyName)
  const payload =
    input.type === 'FETCH_MASTERS' && companyName && !input.payload?.companyName
      ? { ...input.payload, companyName }
      : input.payload

  if (input.idempotencyKey) {
    const existing = await ctx.db.tallyCommand.findFirst({
      where: { idempotencyKey: input.idempotencyKey },
    })
    if (existing) return existing
  }

  const row = await ctx.db.tallyCommand.create({
    data: {
      tenantId: ctx.tenant.id,
      integrationId: integration.id,
      connectorId: input.connectorId ?? null,
      type: input.type,
      payload: payload ?? undefined,
      idempotencyKey: input.idempotencyKey ?? null,
      status: 'PENDING',
      createdById: ctx.user.userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  })

  await auditTally(ctx, {
    action: 'tally.command.enqueue',
    entityType: 'TallyCommand',
    entityId: row.id,
    summary: `Queued Tally command ${input.type}`,
  })

  return row
}

/** System/internal enqueue without user UI permission (payment success path). */
export async function enqueueTallyCommandSystem(input: {
  tenantId: string
  type: TallyCommandType
  payload?: Record<string, unknown>
  idempotencyKey: string
}) {
  const db = tenantDb(input.tenantId)
  const integration = await db.tallyIntegration.findUnique({
    where: { tenantId: input.tenantId },
  })
  if (!integration?.enabled || !integration.autoSyncReceipts) return null

  const existing = await db.tallyCommand.findFirst({
    where: { idempotencyKey: input.idempotencyKey },
  })
  if (existing) return existing

  return db.tallyCommand.create({
    data: {
      tenantId: input.tenantId,
      integrationId: integration.id,
      type: input.type,
      payload: input.payload ?? undefined,
      idempotencyKey: input.idempotencyKey,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    },
  })
}

export async function claimTallyCommands(auth: TallyConnectorAuth) {
  const db = tenantDb(auth.tenantId)
  const now = new Date()

  await db.tallyCommand.updateMany({
    where: {
      connectorId: auth.connectorId,
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    data: { status: 'EXPIRED' },
  })

  // Prefer commands targeted at this connector, else unassigned pending jobs.
  const pending = await db.tallyCommand.findMany({
    where: {
      integrationId: auth.integrationId,
      status: 'PENDING',
      runAfter: { lte: now },
      OR: [{ connectorId: null }, { connectorId: auth.connectorId }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    orderBy: { createdAt: 'asc' },
    take: 10,
  })

  if (pending.length) {
    await db.tallyCommand.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: {
        status: 'CLAIMED',
        claimedAt: now,
        connectorId: auth.connectorId,
        attempts: { increment: 1 },
      },
    })
  }

  return pending.map((p) => ({
    id: p.id,
    type: p.type,
    payload: p.payload,
    idempotencyKey: p.idempotencyKey,
    attempts: p.attempts + 1,
  }))
}

export async function completeTallyCommand(
  auth: TallyConnectorAuth,
  commandId: string,
  input: unknown,
) {
  const data = commandResultSchema.parse(input)
  const db = tenantDb(auth.tenantId)
  const command = await db.tallyCommand.findFirst({
    where: { id: commandId, connectorId: auth.connectorId },
  })
  if (!command) throw notFound('Command not found')

  const status = data.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED'
  await db.tallyCommand.update({
    where: { id: commandId },
    data: {
      status,
      resultJson: data.result ?? undefined,
      error: data.error ?? null,
      errorCode: data.errorCode ?? null,
      completedAt: new Date(),
    },
  })

  // Apply side-effects for voucher / master results
  if (status === 'SUCCEEDED' && data.result) {
    await applyCommandResult(auth.tenantId, command, data.result)
  } else if (status === 'FAILED') {
    await markVoucherFailed(auth.tenantId, command, data.errorCode, data.error)
  }

  await writeTallySyncLog({
    tenantId: auth.tenantId,
    integrationId: auth.integrationId,
    operation: `command.${command.type.toLowerCase()}`,
    entityKind: typeof command.payload === 'object' && command.payload && 'entityKind' in (command.payload as object)
      ? String((command.payload as Record<string, unknown>).entityKind)
      : null,
    entityId: typeof command.payload === 'object' && command.payload && 'entityId' in (command.payload as object)
      ? String((command.payload as Record<string, unknown>).entityId)
      : null,
    status: status === 'SUCCEEDED' ? 'SYNCED' : 'FAILED',
    errorCode: data.errorCode ?? null,
    errorMessage: data.error ?? null,
  })

  return { ok: true }
}

async function applyCommandResult(
  tenantId: string,
  command: { id: string; type: TallyCommandType; payload: unknown; integrationId: string },
  result: Record<string, unknown>,
) {
  const db = tenantDb(tenantId)
  if (command.type === 'FETCH_MASTERS' && Array.isArray(result.ledgers)) {
    const ledgers = result.ledgers as Array<{
      name: string
      parent?: string | null
      guid?: string | null
      isParty?: boolean
    }>
    if (ledgers.length === 0) {
      await db.tallyIntegration.update({
        where: { id: command.integrationId },
        data: {
          health: 'DEGRADED',
          lastConnectionError: 'Tally returned no ledgers. Check the company name matches the company loaded in Tally.',
        },
      })
      return
    }
    for (const raw of ledgers.slice(0, 5000)) {
      const name = cleanTallyName(raw.name)
      if (!name) continue
      const ledger = { ...raw, name, parent: cleanTallyName(raw.parent) }
      await db.tallyLedgerCache.upsert({
        where: {
          tenantId_integrationId_name: {
            tenantId,
            integrationId: command.integrationId,
            name: ledger.name,
          },
        },
        create: {
          tenantId,
          integrationId: command.integrationId,
          name: ledger.name,
          parent: ledger.parent ?? null,
          guid: ledger.guid ?? null,
          isParty: !!ledger.isParty,
        },
        update: {
          parent: ledger.parent ?? null,
          guid: ledger.guid ?? null,
          isParty: !!ledger.isParty,
          syncedAt: new Date(),
        },
      })
    }
    await db.tallyIntegration.update({
      where: { id: command.integrationId },
      data: {
        lastMasterSyncAt: new Date(),
        lastSyncAt: new Date(),
        health: 'HEALTHY',
        lastConnectionAt: new Date(),
        lastConnectionError: null,
      },
    })
  }

  if (
    (command.type === 'CREATE_RECEIPT_VOUCHER' || command.type === 'CREATE_PAYMENT_VOUCHER') &&
    command.payload &&
    typeof command.payload === 'object'
  ) {
    const payload = command.payload as Record<string, unknown>
    const entityId = String(payload.entityId ?? '')
    const entityKind = String(payload.entityKind ?? 'FEE_PAYMENT')
    if (!entityId) return
    await db.tallyVoucherLink.updateMany({
      where: {
        tenantId,
        entityId,
        entityKind: entityKind as 'FEE_PAYMENT' | 'FEE_RECEIPT' | 'SCHOOL_EXPENSE' | 'LEDGER' | 'MASTER',
      },
      data: {
        status: 'SYNCED',
        tallyVoucherNumber: typeof result.voucherNumber === 'string' ? result.voucherNumber : null,
        tallyMasterId: typeof result.masterId === 'string' ? result.masterId : null,
        lastSyncedAt: new Date(),
        lastError: null,
        lastErrorCode: null,
      },
    })
    await db.tallyIntegration.update({
      where: { id: command.integrationId },
      data: { lastSyncAt: new Date(), health: 'HEALTHY', lastConnectionError: null },
    })
  }

  if (command.type === 'TEST_CONNECTION') {
    const ok = result.ok === true
    await db.tallyIntegration.update({
      where: { id: command.integrationId },
      data: {
        health: ok ? 'HEALTHY' : 'OFFLINE',
        lastConnectionAt: new Date(),
        lastConnectionError: ok
          ? null
          : typeof result.errorMessage === 'string'
            ? result.errorMessage
            : 'Connection failed',
        ...(typeof result.selectedCompany === 'string' && cleanTallyName(result.selectedCompany)
          ? { companyName: cleanTallyName(result.selectedCompany) }
          : {}),
      },
    })
  }

  if (command.type === 'FETCH_BALANCES' && Array.isArray(result.ledgers)) {
    const ledgers = result.ledgers as Array<{ name: string; closing?: number }>
    for (const raw of ledgers.slice(0, 5000)) {
      const name = cleanTallyName(raw.name)
      if (!name) continue
      await db.tallyLedgerCache.updateMany({
        where: { integrationId: command.integrationId, name },
        data: { closingBalanceMinor: Math.round(-(Number(raw.closing) || 0) * 100), syncedAt: new Date() },
      })
    }
    await db.tallyIntegration.update({
      where: { id: command.integrationId },
      data: { lastSyncAt: new Date(), health: 'HEALTHY', lastConnectionAt: new Date(), lastConnectionError: null },
    })
  }

  if (command.type === 'LIST_COMPANIES' && Array.isArray(result.companies)) {
    await db.tallyIntegration.update({
      where: { id: command.integrationId },
      data: {
        health: 'HEALTHY',
        lastConnectionAt: new Date(),
        lastConnectionError: null,
        settingsJson: { companies: result.companies },
      },
    })
  }
}

async function markVoucherFailed(
  tenantId: string,
  command: { payload: unknown; integrationId: string; attempts: number; maxAttempts: number },
  errorCode?: string | null,
  error?: string | null,
) {
  if (!command.payload || typeof command.payload !== 'object') return
  const payload = command.payload as Record<string, unknown>
  const entityId = String(payload.entityId ?? '')
  if (!entityId) return
  const db = tenantDb(tenantId)
  const terminal = command.attempts >= command.maxAttempts
  await db.tallyVoucherLink.updateMany({
    where: { tenantId, entityId },
    data: {
      status: terminal ? 'REQUIRES_REVIEW' : 'RETRYING',
      lastError: error ?? null,
      lastErrorCode: errorCode ?? null,
      attempts: { increment: 1 },
    },
  })
  await db.tallyIntegration.update({
    where: { id: command.integrationId },
    data: {
      health: 'REQUIRES_ATTENTION',
      lastConnectionError: error ?? errorCode ?? 'Sync failed',
    },
  })
}
