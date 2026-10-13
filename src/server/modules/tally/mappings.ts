import type { AppContext } from '@/server/context'
import { badRequest, notFound } from '@/server/api/response'
import { auditTally } from './logging'
import { accountingRuleSchema, mappingUpsertSchema } from './schema'
import { getOrCreateIntegration } from './settings'

export function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Deterministic similarity 0–100 for ledger matching suggestions. */
export function nameMatchScore(a: string, b: string): number {
  const left = normaliseName(a)
  const right = normaliseName(b)
  if (!left || !right) return 0
  if (left === right) return 100
  if (left.includes(right) || right.includes(left)) return 92
  const leftTokens = new Set(left.split(' '))
  const rightTokens = right.split(' ')
  const overlap = rightTokens.filter((t) => leftTokens.has(t)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return Math.round((overlap / Math.max(1, union)) * 100)
}

export async function listMappings(ctx: AppContext, kind?: string) {
  if (!ctx.canAny('fees.tally', 'fees.tally_manage', 'settings.integrations')) {
    ctx.require('fees.tally')
  }
  const integration = await getOrCreateIntegration(ctx)
  return ctx.db.tallyMapping.findMany({
    where: {
      integrationId: integration.id,
      ...(kind ? { kind: kind as 'FEE_HEAD' } : {}),
    },
    orderBy: [{ kind: 'asc' }, { localLabel: 'asc' }],
  })
}

export async function upsertMapping(ctx: AppContext, input: unknown) {
  ctx.require('fees.tally_manage')
  const data = mappingUpsertSchema.parse(input)
  const integration = await getOrCreateIntegration(ctx)

  const row = await ctx.db.tallyMapping.upsert({
    where: {
      tenantId_integrationId_kind_localKey: {
        tenantId: ctx.tenant.id,
        integrationId: integration.id,
        kind: data.kind,
        localKey: data.localKey,
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      integrationId: integration.id,
      kind: data.kind,
      localKey: data.localKey,
      localLabel: data.localLabel ?? null,
      tallyLedgerName: data.tallyLedgerName,
      tallyGuid: data.tallyGuid ?? null,
      tallyParent: data.tallyParent ?? null,
      notes: data.notes ?? null,
      active: true,
      autoMatched: false,
    },
    update: {
      localLabel: data.localLabel ?? null,
      tallyLedgerName: data.tallyLedgerName,
      tallyGuid: data.tallyGuid ?? null,
      tallyParent: data.tallyParent ?? null,
      notes: data.notes ?? null,
      active: true,
      autoMatched: false,
    },
  })

  await auditTally(ctx, {
    action: 'tally.mapping.upsert',
    entityType: 'TallyMapping',
    entityId: row.id,
    summary: `Mapped ${data.kind} ${data.localLabel ?? data.localKey} → ${data.tallyLedgerName}`,
  })

  return row
}

export async function deleteMapping(ctx: AppContext, id: string) {
  ctx.require('fees.tally_manage')
  const row = await ctx.db.tallyMapping.findFirst({ where: { id } })
  if (!row) throw notFound('Mapping not found')
  await ctx.db.tallyMapping.delete({ where: { id } })
  await auditTally(ctx, {
    action: 'tally.mapping.delete',
    entityType: 'TallyMapping',
    entityId: id,
    summary: `Removed Tally mapping ${row.kind} ${row.localKey}`,
  })
  return { ok: true }
}

export async function suggestFeeHeadMappings(ctx: AppContext) {
  if (!ctx.canAny('fees.tally', 'fees.tally_manage')) ctx.require('fees.tally')
  const integration = await getOrCreateIntegration(ctx)
  const [heads, ledgers, existing] = await Promise.all([
    ctx.db.feeHead.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    ctx.db.tallyLedgerCache.findMany({
      where: { integrationId: integration.id },
      select: { name: true, parent: true, guid: true },
      take: 5000,
    }),
    ctx.db.tallyMapping.findMany({
      where: { integrationId: integration.id, kind: 'FEE_HEAD', active: true },
      select: { localKey: true, tallyLedgerName: true },
    }),
  ])

  const mapped = new Map(existing.map((m) => [m.localKey, m.tallyLedgerName]))

  return heads.map((head) => {
    const current = mapped.get(head.id) ?? null
    let best: { name: string; score: number; parent?: string | null; guid?: string | null } | null =
      null
    for (const ledger of ledgers) {
      const score = Math.max(
        nameMatchScore(head.name, ledger.name),
        nameMatchScore(head.code, ledger.name),
      )
      if (!best || score > best.score) {
        best = { name: ledger.name, score, parent: ledger.parent, guid: ledger.guid }
      }
    }
    return {
      feeHeadId: head.id,
      code: head.code,
      name: head.name,
      mappedLedger: current,
      suggestion:
        !current && best && best.score >= 70
          ? { ledgerName: best.name, score: best.score, parent: best.parent, guid: best.guid }
          : null,
    }
  })
}

export async function autoAcceptSuggestions(ctx: AppContext, minScore = 92) {
  ctx.require('fees.tally_manage')
  const suggestions = await suggestFeeHeadMappings(ctx)
  const integration = await getOrCreateIntegration(ctx)
  let created = 0
  for (const row of suggestions) {
    if (row.mappedLedger || !row.suggestion || row.suggestion.score < minScore) continue
    await ctx.db.tallyMapping.upsert({
      where: {
        tenantId_integrationId_kind_localKey: {
          tenantId: ctx.tenant.id,
          integrationId: integration.id,
          kind: 'FEE_HEAD',
          localKey: row.feeHeadId,
        },
      },
      create: {
        tenantId: ctx.tenant.id,
        integrationId: integration.id,
        kind: 'FEE_HEAD',
        localKey: row.feeHeadId,
        localLabel: row.name,
        tallyLedgerName: row.suggestion.ledgerName,
        tallyGuid: row.suggestion.guid ?? null,
        tallyParent: row.suggestion.parent ?? null,
        autoMatched: true,
        matchScore: row.suggestion.score,
        active: true,
      },
      update: {
        tallyLedgerName: row.suggestion.ledgerName,
        autoMatched: true,
        matchScore: row.suggestion.score,
        active: true,
      },
    })
    created++
  }
  return { created }
}

export async function listAccountingRules(ctx: AppContext) {
  if (!ctx.canAny('fees.tally', 'fees.tally_manage')) ctx.require('fees.tally')
  const integration = await getOrCreateIntegration(ctx)
  return ctx.db.tallyAccountingRule.findMany({
    where: { integrationId: integration.id },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

export async function upsertAccountingRule(ctx: AppContext, input: unknown) {
  ctx.require('fees.tally_manage')
  const data = accountingRuleSchema.parse(input)
  const integration = await getOrCreateIntegration(ctx)
  const row = await ctx.db.tallyAccountingRule.upsert({
    where: {
      tenantId_integrationId_name: {
        tenantId: ctx.tenant.id,
        integrationId: integration.id,
        name: data.name,
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      integrationId: integration.id,
      name: data.name,
      paymentMode: data.paymentMode ?? null,
      feeHeadId: data.feeHeadId ?? null,
      debitLedgerName: data.debitLedgerName,
      creditLedgerName: data.creditLedgerName ?? null,
      voucherType: data.voucherType,
      narrationTemplate: data.narrationTemplate ?? null,
      active: data.active ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
    update: {
      paymentMode: data.paymentMode ?? null,
      feeHeadId: data.feeHeadId ?? null,
      debitLedgerName: data.debitLedgerName,
      creditLedgerName: data.creditLedgerName ?? null,
      voucherType: data.voucherType,
      narrationTemplate: data.narrationTemplate ?? null,
      active: data.active ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  await auditTally(ctx, {
    action: 'tally.rule.upsert',
    entityType: 'TallyAccountingRule',
    entityId: row.id,
    summary: `Saved accounting rule ${row.name}`,
  })
  return row
}

async function requireCachedLedger(ctx: AppContext, integrationId: string, ledgerName: string) {
  const ledger = await ctx.db.tallyLedgerCache.findFirst({
    where: { integrationId, name: ledgerName },
    select: { name: true, parent: true, guid: true },
  })
  if (!ledger) throw badRequest(`"${ledgerName}" is not in the synced Tally ledgers. Run Sync masters first.`)
  return ledger
}

/** Manual fee-head mapping. An empty ledger name removes the mapping. */
export async function mapFeeHeadToLedger(
  ctx: AppContext,
  input: { feeHeadId: string; ledgerName: string },
) {
  ctx.require('fees.tally_manage')
  const integration = await getOrCreateIntegration(ctx)
  const head = await ctx.db.feeHead.findFirst({
    where: { id: input.feeHeadId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!head) throw notFound('Fee head not found')

  const ledgerName = input.ledgerName.trim()
  if (!ledgerName) {
    const existing = await ctx.db.tallyMapping.findFirst({
      where: { integrationId: integration.id, kind: 'FEE_HEAD', localKey: head.id },
    })
    if (existing) await deleteMapping(ctx, existing.id)
    return null
  }

  const ledger = await requireCachedLedger(ctx, integration.id, ledgerName)
  return upsertMapping(ctx, {
    kind: 'FEE_HEAD',
    localKey: head.id,
    localLabel: head.name,
    tallyLedgerName: ledger.name,
    tallyParent: ledger.parent ?? null,
    tallyGuid: ledger.guid ?? null,
  })
}

export async function setRuleDebitLedger(ctx: AppContext, input: { ruleId: string; ledgerName: string }) {
  ctx.require('fees.tally_manage')
  const integration = await getOrCreateIntegration(ctx)
  const rule = await ctx.db.tallyAccountingRule.findFirst({
    where: { id: input.ruleId, integrationId: integration.id },
  })
  if (!rule) throw notFound('Rule not found')
  const ledger = await requireCachedLedger(ctx, integration.id, input.ledgerName.trim())
  const row = await ctx.db.tallyAccountingRule.update({
    where: { id: rule.id },
    data: { debitLedgerName: ledger.name },
  })
  await auditTally(ctx, {
    action: 'tally.rule.upsert',
    entityType: 'TallyAccountingRule',
    entityId: row.id,
    summary: `${row.name}: debit ledger ${rule.debitLedgerName} → ${ledger.name}`,
  })
  return row
}

export async function listCachedLedgers(ctx: AppContext, q?: string) {
  if (!ctx.canAny('fees.tally', 'fees.tally_manage')) ctx.require('fees.tally')
  const integration = await getOrCreateIntegration(ctx)
  return ctx.db.tallyLedgerCache.findMany({
    where: {
      integrationId: integration.id,
      ...(q
        ? { name: { contains: q, mode: 'insensitive' as const } }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: 500,
  })
}

export async function ensureDefaultPaymentModeRules(ctx: AppContext) {
  ctx.require('fees.tally_manage')
  const integration = await getOrCreateIntegration(ctx)
  const defaults: Array<{ name: string; paymentMode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'ONLINE'; debit: string }> = [
    { name: 'Cash receipts', paymentMode: 'CASH', debit: 'Cash' },
    { name: 'UPI receipts', paymentMode: 'UPI', debit: 'UPI Collection' },
    { name: 'Bank transfer receipts', paymentMode: 'BANK_TRANSFER', debit: 'Bank Account' },
    { name: 'Cheque receipts', paymentMode: 'CHEQUE', debit: 'Cheque Collection' },
    { name: 'Card receipts', paymentMode: 'CARD', debit: 'Card Collection' },
    { name: 'Online gateway receipts', paymentMode: 'ONLINE', debit: 'Payment Gateway Clearing' },
  ]
  let created = 0
  for (const rule of defaults) {
    const existing = await ctx.db.tallyAccountingRule.findFirst({
      where: { integrationId: integration.id, name: rule.name },
    })
    if (existing) continue
    await ctx.db.tallyAccountingRule.create({
      data: {
        tenantId: ctx.tenant.id,
        integrationId: integration.id,
        name: rule.name,
        paymentMode: rule.paymentMode,
        debitLedgerName: rule.debit,
        voucherType: 'Receipt',
        narrationTemplate: 'Fee receipt {{receiptNumber}} — {{studentName}}',
        active: true,
      },
    })
    created++
  }
  return { created }
}
