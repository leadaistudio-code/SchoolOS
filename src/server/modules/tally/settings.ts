import type { AppContext } from '@/server/context'
import { badRequest } from '@/server/api/response'
import { assertDirectHostAllowed } from '@/server/integrations/tally'
import { cleanTallyName } from '@/server/integrations/tally/xml'
import { auditTally, writeTallySyncLog } from './logging'
import { upsertIntegrationSchema } from './schema'

export async function getOrCreateIntegration(ctx: AppContext) {
  if (!ctx.canAny('fees.tally', 'fees.tally_manage', 'settings.integrations')) {
    ctx.require('fees.tally')
  }
  const existing = await ctx.db.tallyIntegration.findUnique({
    where: { tenantId: ctx.tenant.id },
  })
  if (existing) return existing
  return ctx.db.tallyIntegration.create({
    data: {
      tenantId: ctx.tenant.id,
      enabled: false,
      testMode: true,
      mode: 'CONNECTOR',
      provider: 'ERP9',
    },
  })
}

export async function getTallyStatus(ctx: AppContext) {
  const integration = await getOrCreateIntegration(ctx)
  const [connectors, pending, failed, syncedToday, unmappedHeads] = await Promise.all([
    ctx.db.tallyConnector.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        status: true,
        enabled: true,
        version: true,
        hostname: true,
        tallyHost: true,
        tallyPort: true,
        lastSeenAt: true,
        pendingJobs: true,
        pairedAt: true,
      },
    }),
    ctx.db.tallyVoucherLink.count({
      where: { status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] } },
    }),
    ctx.db.tallyVoucherLink.count({
      where: { status: { in: ['FAILED', 'REQUIRES_REVIEW'] } },
    }),
    ctx.db.tallyVoucherLink.count({
      where: {
        status: 'SYNCED',
        lastSyncedAt: { gte: startOfUtcDay() },
      },
    }),
    countUnmappedFeeHeads(ctx, integration.id),
  ])

  return {
    integration: {
      id: integration.id,
      enabled: integration.enabled,
      provider: integration.provider,
      mode: integration.mode,
      companyName: integration.companyName,
      // Never return DIRECT host/port to non-admins configuring secrets? Admins need it.
      host: integration.mode === 'DIRECT' ? integration.host : null,
      port: integration.port,
      timeoutMs: integration.timeoutMs,
      syncFrequencyMin: integration.syncFrequencyMin,
      autoSyncReceipts: integration.autoSyncReceipts,
      autoSyncExpenses: integration.autoSyncExpenses,
      autoCreateLedgers: integration.autoCreateLedgers,
      autoSyncMasters: integration.autoSyncMasters,
      testMode: integration.testMode,
      partyModel: integration.partyModel,
      health: integration.health,
      lastConnectionAt: integration.lastConnectionAt,
      lastConnectionError: integration.lastConnectionError,
      lastSyncAt: integration.lastSyncAt,
      lastMasterSyncAt: integration.lastMasterSyncAt,
    },
    connectors,
    metrics: {
      pending,
      failed,
      syncedToday,
      unmappedFeeHeads: unmappedHeads,
    },
  }
}

async function countUnmappedFeeHeads(ctx: AppContext, integrationId: string) {
  const heads = await ctx.db.feeHead.findMany({
    where: { deletedAt: null },
    select: { id: true },
  })
  if (heads.length === 0) return 0
  const mapped = await ctx.db.tallyMapping.findMany({
    where: {
      integrationId,
      kind: 'FEE_HEAD',
      active: true,
      localKey: { in: heads.map((h) => h.id) },
    },
    select: { localKey: true },
  })
  const set = new Set(mapped.map((m) => m.localKey))
  return heads.filter((h) => !set.has(h.id)).length
}

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export async function updateTallyIntegration(ctx: AppContext, input: unknown) {
  ctx.require('settings.integrations')
  const data = upsertIntegrationSchema.parse(input)
  const integration = await getOrCreateIntegration(ctx)

  if (data.mode === 'DIRECT' || (data.host && (data.mode ?? integration.mode) === 'DIRECT')) {
    const host = data.host ?? integration.host
    if (!host) throw badRequest('Direct mode requires a Tally host')
    try {
      assertDirectHostAllowed(host)
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : 'Direct host not allowed')
    }
  }

  const updated = await ctx.db.tallyIntegration.update({
    where: { id: integration.id },
    data: {
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.provider !== undefined ? { provider: data.provider } : {}),
      ...(data.mode !== undefined ? { mode: data.mode } : {}),
      ...(data.companyName !== undefined ? { companyName: cleanTallyName(data.companyName) } : {}),
      ...(data.companyGuid !== undefined ? { companyGuid: data.companyGuid } : {}),
      ...(data.host !== undefined ? { host: data.host } : {}),
      ...(data.port !== undefined ? { port: data.port } : {}),
      ...(data.timeoutMs !== undefined ? { timeoutMs: data.timeoutMs } : {}),
      ...(data.syncFrequencyMin !== undefined ? { syncFrequencyMin: data.syncFrequencyMin } : {}),
      ...(data.autoSyncReceipts !== undefined ? { autoSyncReceipts: data.autoSyncReceipts } : {}),
      ...(data.autoSyncExpenses !== undefined ? { autoSyncExpenses: data.autoSyncExpenses } : {}),
      ...(data.autoCreateLedgers !== undefined ? { autoCreateLedgers: data.autoCreateLedgers } : {}),
      ...(data.autoSyncMasters !== undefined ? { autoSyncMasters: data.autoSyncMasters } : {}),
      ...(data.testMode !== undefined ? { testMode: data.testMode } : {}),
      ...(data.partyModel !== undefined ? { partyModel: data.partyModel } : {}),
    },
  })

  await auditTally(ctx, {
    action: 'tally.integration.update',
    entityType: 'TallyIntegration',
    entityId: updated.id,
    summary: `Updated Tally integration (enabled=${updated.enabled}, mode=${updated.mode}, testMode=${updated.testMode})`,
    after: {
      enabled: updated.enabled,
      mode: updated.mode,
      companyName: updated.companyName,
      testMode: updated.testMode,
    },
  })

  await writeTallySyncLog({
    tenantId: ctx.tenant.id,
    integrationId: updated.id,
    userId: ctx.user.userId,
    operation: 'integration.update',
    status: 'SYNCED',
  })

  return updated
}
