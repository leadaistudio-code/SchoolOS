import { randomUUID } from 'node:crypto'
import type { AppContext } from '@/server/context'
import { getOrCreateIntegration } from './settings'
import { auditTally } from './logging'

/**
 * Compare MyCampusView SUCCESS payments vs Tally voucher links for a date range.
 * Does not mutate Tally or MCV money records — review only.
 */
export async function runReconciliation(
  ctx: AppContext,
  input?: { from?: Date; to?: Date },
) {
  ctx.require('fees.tally_manage')
  const integration = await getOrCreateIntegration(ctx)
  const to = input?.to ?? new Date()
  const from =
    input?.from ??
    new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - 30))

  const payments = await ctx.db.feePayment.findMany({
    where: {
      status: 'SUCCESS',
      paidAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      amountMinor: true,
      paidAt: true,
      receipt: { select: { number: true } },
    },
    take: 2000,
  })

  const links = await ctx.db.tallyVoucherLink.findMany({
    where: {
      entityKind: 'FEE_PAYMENT',
      entityId: { in: payments.map((p) => p.id) },
    },
  })
  const byEntity = new Map(links.map((l) => [l.entityId, l]))
  const runId = randomUUID()

  await ctx.db.tallyReconciliationItem.deleteMany({
    where: {
      integrationId: integration.id,
      createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60_000) },
    },
  })

  const items = []
  for (const payment of payments) {
    const link = byEntity.get(payment.id)
    let status:
      | 'MATCHED'
      | 'UNMATCHED_MCV'
      | 'AMOUNT_MISMATCH'
      | 'FAILED_SYNC'
      | 'REVIEW' = 'UNMATCHED_MCV'

    if (!link) status = 'UNMATCHED_MCV'
    else if (link.status === 'SYNCED') {
      if (link.amountMinor != null && link.amountMinor !== payment.amountMinor) {
        status = 'AMOUNT_MISMATCH'
      } else {
        status = 'MATCHED'
      }
    } else if (link.status === 'FAILED' || link.status === 'REQUIRES_REVIEW') {
      status = 'FAILED_SYNC'
    } else {
      status = 'REVIEW'
    }

    items.push(
      await ctx.db.tallyReconciliationItem.create({
        data: {
          tenantId: ctx.tenant.id,
          integrationId: integration.id,
          runId,
          status,
          mcvEntityKind: 'FEE_PAYMENT',
          mcvEntityId: payment.id,
          mcvAmountMinor: payment.amountMinor,
          mcvDate: payment.paidAt,
          tallyVoucherNo: link?.tallyVoucherNumber ?? null,
          tallyAmountMinor: link?.amountMinor ?? null,
          tallyDate: link?.voucherDate ?? null,
          notes: payment.receipt?.number ?? null,
        },
      }),
    )
  }

  await auditTally(ctx, {
    action: 'tally.reconciliation.run',
    entityType: 'TallyReconciliationItem',
    entityId: runId,
    summary: `Reconciliation run ${runId}: ${items.length} payments compared`,
  })

  const summary = {
    runId,
    total: items.length,
    matched: items.filter((i) => i.status === 'MATCHED').length,
    unmatchedMcv: items.filter((i) => i.status === 'UNMATCHED_MCV').length,
    amountMismatch: items.filter((i) => i.status === 'AMOUNT_MISMATCH').length,
    failedSync: items.filter((i) => i.status === 'FAILED_SYNC').length,
    review: items.filter((i) => i.status === 'REVIEW').length,
  }

  return { summary, items: items.slice(0, 200) }
}

export async function listReconciliation(ctx: AppContext, runId?: string) {
  if (!ctx.canAny('fees.tally', 'fees.tally_manage')) ctx.require('fees.tally')
  const integration = await getOrCreateIntegration(ctx)
  const latestRun = runId
    ? runId
    : (
        await ctx.db.tallyReconciliationItem.findFirst({
          where: { integrationId: integration.id },
          orderBy: { createdAt: 'desc' },
          select: { runId: true },
        })
      )?.runId

  if (!latestRun) return { runId: null, items: [], summary: null }

  const items = await ctx.db.tallyReconciliationItem.findMany({
    where: { integrationId: integration.id, runId: latestRun },
    orderBy: { createdAt: 'asc' },
    take: 500,
  })

  return {
    runId: latestRun,
    items,
    summary: {
      total: items.length,
      matched: items.filter((i) => i.status === 'MATCHED').length,
      unmatchedMcv: items.filter((i) => i.status === 'UNMATCHED_MCV').length,
      amountMismatch: items.filter((i) => i.status === 'AMOUNT_MISMATCH').length,
      failedSync: items.filter((i) => i.status === 'FAILED_SYNC').length,
      review: items.filter((i) => i.status === 'REVIEW').length,
    },
  }
}
