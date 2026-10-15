import { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { AppContext } from '@/server/context'
import type { TenantClient } from '@/server/db/tenant-client'
import { ApiException, badRequest, conflict, forbidden, notFound } from '@/server/api/response'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { writeJournalEntry } from '@/server/modules/accounts/posting'
import { reverseLines } from '@/server/modules/accounts/math'
import { attendanceDate } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'
import { assertPostingAllowed, getAccountingFlags, recordAccountingEvent, saveAccountingSettings } from './service'
import { isIsoDate, toIsoDay } from './fiscal-year'
import { cashBankAccounts } from './cash-bank'
import {
  computeDepreciation,
  defaultResidualMinor,
  depreciatedThrough,
  depreciationJournalLines,
  disposalJournalLines,
  isBalanced,
  isFullyDepreciated,
  isPeriodEnd,
  periodContaining,
  projectSchedule,
  reconcileAssetRegister,
  writtenDownValue,
  type AssetTerms,
  type ComputedLine,
  type DepreciationFrequency,
  type PostingLine,
  type ScheduleLine,
} from './fixed-assets'

// ------------------------------------------------------------------ setup

/** Ledger accounts this module needs. Created on first use, never for every school. */
export const FIXED_ASSET_CHART = [
  { systemKey: 'FIXED_ASSETS', code: '1500', name: 'Fixed Assets (at cost)', type: 'ASSET', description: 'Furniture, equipment, vehicles and buildings at original cost' },
  { systemKey: 'ACCUMULATED_DEPRECIATION', code: '1590', name: 'Accumulated Depreciation', type: 'ASSET', description: 'Credit balance; deducted from fixed assets at cost' },
  { systemKey: 'EXP_DEPRECIATION', code: '5020', name: 'Depreciation', type: 'EXPENSE', expenseNature: 'INDIRECT' },
  { systemKey: 'GAIN_ON_ASSET_DISPOSAL', code: '4013', name: 'Profit on Sale of Assets', type: 'INCOME' },
  { systemKey: 'LOSS_ON_ASSET_DISPOSAL', code: '5021', name: 'Loss on Sale / Scrapping of Assets', type: 'EXPENSE', expenseNature: 'INDIRECT' },
] as const

/** Accounts that can never hold an asset's cost. */
const NOT_ASSET_LEDGERS = new Set(['CASH', 'BANK', 'STORE_STOCK', 'ACCUMULATED_DEPRECIATION'])

type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0]
type Db = TenantClient | Tx

function who(ctx: AppContext) {
  return { id: ctx.user.userId, label: `${ctx.user.firstName} ${ctx.user.lastName}`.trim() }
}

async function requireFixedAssets(ctx: AppContext, permission: 'accounts.view' | 'accounts.manage') {
  ctx.require(permission)
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) throw new ApiException(403, 'FEATURE_DISABLED', 'Fixed asset accounting is not enabled for this school')
  return flags
}

async function ensureFixedAssetChart(db: Pick<TenantClient, 'ledgerAccount'>, tenantId: string) {
  const existing = await db.ledgerAccount.findMany({ select: { systemKey: true, code: true } })
  const keys = new Set(existing.map((a) => a.systemKey).filter(Boolean))
  const codes = new Set(existing.map((a) => a.code))
  const missing = FIXED_ASSET_CHART.filter((seed) => !keys.has(seed.systemKey))
  if (!missing.length) return
  await db.ledgerAccount.createMany({
    data: missing.map((seed) => {
      let code: string = seed.code
      for (let n = 1; codes.has(code); n++) code = `${seed.code}-${n}`
      codes.add(code)
      return { tenantId, ...seed, code }
    }),
    skipDuplicates: true,
  })
}

async function systemAccounts(db: Pick<TenantClient, 'ledgerAccount'>) {
  const rows = await db.ledgerAccount.findMany({
    where: { systemKey: { in: FIXED_ASSET_CHART.map((s) => s.systemKey) } },
    select: { id: true, systemKey: true },
  })
  const by = new Map(rows.map((r) => [r.systemKey, r.id]))
  const need = (key: string) => {
    const id = by.get(key)
    if (!id) throw new Error(`Ledger system account ${key} is missing`)
    return id
  }
  return {
    fixedAssets: need('FIXED_ASSETS'),
    accumulated: need('ACCUMULATED_DEPRECIATION'),
    expense: need('EXP_DEPRECIATION'),
    gain: need('GAIN_ON_ASSET_DISPOSAL'),
    loss: need('LOSS_ON_ASSET_DISPOSAL'),
  }
}

async function depreciationFrequency(db: Pick<TenantClient, 'accountingSettings'>): Promise<DepreciationFrequency> {
  const row = await db.accountingSettings.findFirst({ select: { depreciationFrequency: true } }).catch(() => null)
  return row?.depreciationFrequency ?? 'YEARLY'
}

async function lockAsset(tx: Tx, tenantId: string, assetId: string) {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    'SELECT "id" FROM "FixedAsset" WHERE "id" = $1 AND "tenantId" = $2 FOR UPDATE',
    assetId,
    tenantId,
  )
  if (!rows.length) throw notFound('Fixed asset')
}

async function lockRuns(tx: Tx, tenantId: string) {
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS locked', `${tenantId}:depreciation-runs`)
}

function isUniqueViolation(error: unknown, field?: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false
  if (!field) return true
  const target = (error.meta?.target ?? []) as string[] | string
  return Array.isArray(target) ? target.includes(field) : String(target).includes(field)
}

const isoDate = z.string().refine(isIsoDate, 'Enter a valid date')
const minor = z.number().int().min(0).max(2_147_483_647)
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))
const reasonSchema = z.string().trim().min(3, 'Give a reason').max(500)

// ------------------------------------------------------------ terms + lines

type AssetRow = {
  id: string
  costMinor: number
  openingAccumulatedMinor: number
  depreciationStartOn: Date
  residualMinor: number
  usefulLifeMonths: number | null
  rateBp: number
  disposedOn: Date | null
}

type RateChangeRow = { effectiveFrom: Date; previousRateBp: number; rateBp: number; createdAt: Date }

/**
 * Rate segments from the history, in the order changes were made: a later
 * change replaces any earlier-made change effective on or after its own date
 * (possible once runs have been reversed).
 */
export function assetTerms(asset: AssetRow, changes: RateChangeRow[]): AssetTerms {
  const start = toIsoDay(asset.depreciationStartOn)
  const made = [...changes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  let rates = [{ from: start, rateBp: made.length ? made[0]!.previousRateBp : asset.rateBp }]
  for (const change of made) {
    const from = toIsoDay(change.effectiveFrom) < start ? start : toIsoDay(change.effectiveFrom)
    rates = [...rates.filter((r) => r.from < from), { from, rateBp: change.rateBp }]
  }
  return {
    costMinor: asset.costMinor,
    openingAccumulatedMinor: asset.openingAccumulatedMinor,
    depreciationStartOn: start,
    residualMinor: asset.residualMinor,
    usefulLifeMonths: asset.usefulLifeMonths,
    rates,
    disposedOn: asset.disposedOn ? toIsoDay(asset.disposedOn) : null,
  }
}

/** Posted schedule lines per asset (lines of POSTED runs only). */
async function postedLines(db: Pick<TenantClient, 'depreciationLine'>, assetIds: string[]) {
  const by = new Map<string, ScheduleLine[]>()
  if (!assetIds.length) return by
  const rows = await db.depreciationLine.findMany({
    where: { assetId: { in: assetIds }, run: { status: 'POSTED' } },
    select: { assetId: true, fromDate: true, toDate: true, amountMinor: true },
    orderBy: { toDate: 'asc' },
  })
  for (const r of rows) {
    const list = by.get(r.assetId) ?? []
    list.push({ fromDate: toIsoDay(r.fromDate), toDate: toIsoDay(r.toDate), amountMinor: r.amountMinor })
    by.set(r.assetId, list)
  }
  return by
}

async function rateChangesFor(db: Pick<TenantClient, 'fixedAssetRateChange'>, assetIds: string[]) {
  const by = new Map<string, RateChangeRow[]>()
  if (!assetIds.length) return by
  const rows = await db.fixedAssetRateChange.findMany({
    where: { assetId: { in: assetIds } },
    select: { assetId: true, effectiveFrom: true, previousRateBp: true, rateBp: true, createdAt: true },
  })
  for (const r of rows) by.set(r.assetId, [...(by.get(r.assetId) ?? []), r])
  return by
}

async function postJournal(
  tx: Tx,
  ctx: AppContext,
  params: { sourceType: 'DEPRECIATION' | 'FIXED_ASSET'; sourceId: string; postingKey: string; date: string; voucherType: 'JOURNAL' | 'PAYMENT' | 'RECEIPT'; narration: string; reference: string; lines: PostingLine[] },
) {
  if (!isBalanced(params.lines)) throw new Error('Fixed asset journal does not balance')
  const actor = who(ctx)
  return writeJournalEntry(tx, ctx.tenant.id, {
    date: attendanceDate(params.date),
    voucherType: params.voucherType,
    narration: params.narration,
    reference: params.reference,
    lines: params.lines,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    postingKey: params.postingKey,
    createdById: actor.id,
    createdByLabel: actor.label,
  })
}

/** Reverses an active entry on the date of the original, so the books agree with the register at every date. */
async function reverseEntry(tx: Tx, ctx: AppContext, postingKey: string, reason: string) {
  const active = await tx.journalEntry.findFirst({ where: { postingKey, reversedAt: null }, include: { lines: true } })
  if (!active) return null
  const claimed = await tx.journalEntry.updateMany({ where: { id: active.id, reversedAt: null }, data: { reversedAt: new Date() } })
  if (claimed.count !== 1) throw conflict('This was changed by someone else; reload and try again')
  const actor = who(ctx)
  return writeJournalEntry(tx, ctx.tenant.id, {
    date: active.date,
    voucherType: active.voucherType,
    narration: `Reversal of ${active.number}: ${reason}`,
    reference: active.reference,
    lines: reverseLines(active.lines),
    sourceType: active.sourceType,
    sourceId: active.sourceId,
    postingKey: `${postingKey}:rev`,
    isReversal: true,
    reversalOfId: active.id,
    createdById: actor.id,
    createdByLabel: actor.label,
  })
}

// ------------------------------------------------------------------ assets

export const fixedAssetSchema = z.object({
  name: z.string().trim().min(2, 'Enter the asset name').max(160),
  category: z.string().trim().min(2, 'Enter a category').max(80),
  location: optionalText(120),
  department: optionalText(120),
  inventoryAssetId: optionalText(40),
  capitalisedOn: isoDate,
  costMinor: minor.refine((v) => v > 0, 'Enter the cost'),
  residualMinor: minor.optional(),
  usefulLifeMonths: z.number().int().min(1).max(1200).nullable().optional(),
  rateBp: z.number().int().min(1, 'Enter the annual WDV rate').max(10_000, 'The rate cannot exceed 100%'),
  depreciationStartOn: isoDate.optional(),
  openingAccumulatedMinor: minor.default(0),
  assetAccountId: optionalText(40),
  capitalisation: z.enum(['EXISTING', 'POSTED']).default('EXISTING'),
  fundingAccountId: optionalText(40),
  notes: optionalText(1000),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})
export type FixedAssetInput = z.infer<typeof fixedAssetSchema>

async function assetLedgerOptions(db: Pick<TenantClient, 'ledgerAccount' | 'ledgerAccountMap'>) {
  const cash = new Set((await cashBankAccounts(db)).map((a) => a.id))
  const rows = await db.ledgerAccount.findMany({
    where: { type: 'ASSET', isActive: true },
    select: { id: true, code: true, name: true, systemKey: true },
    orderBy: { code: 'asc' },
  })
  return rows.filter((a) => !cash.has(a.id) && !NOT_ASSET_LEDGERS.has(a.systemKey ?? ''))
}

async function fundingOptions(db: Pick<TenantClient, 'ledgerAccount' | 'ledgerAccountMap'>) {
  const cash = (await cashBankAccounts(db)).filter((a) => a.isActive)
  const equity = await db.ledgerAccount.findMany({ where: { systemKey: 'OPENING_EQUITY', isActive: true }, select: { id: true, code: true, name: true, systemKey: true } })
  return [...cash.map((a) => ({ id: a.id, code: a.code, name: a.name, systemKey: a.systemKey })), ...equity]
}

/** Account choices for the asset form. Creates the module's ledgers on first use. */
export async function fixedAssetFormOptions(ctx: AppContext) {
  await requireFixedAssets(ctx, 'accounts.manage')
  await ensureFixedAssetChart(ctx.db, ctx.tenant.id)
  const [assetLedgers, funding, inventory] = await Promise.all([
    assetLedgerOptions(ctx.db),
    fundingOptions(ctx.db),
    ctx.can('inventory.view')
      ? ctx.db.asset.findMany({ where: { deletedAt: null }, select: { id: true, assetCode: true, name: true }, orderBy: { assetCode: 'asc' }, take: 500 })
      : Promise.resolve([]),
  ])
  return { assetLedgers, funding, inventory }
}

function checkAmounts(costMinor: number, residualMinor: number, openingAccumulatedMinor: number) {
  if (residualMinor > costMinor) throw badRequest('Residual value cannot exceed the cost')
  if (openingAccumulatedMinor > costMinor - residualMinor) {
    throw badRequest('Depreciation brought forward cannot take the asset below its residual value')
  }
}

export async function createFixedAsset(ctx: AppContext, raw: unknown) {
  const flags = await requireFixedAssets(ctx, 'accounts.manage')
  const input = fixedAssetSchema.parse(raw)
  if (input.idempotencyKey) {
    const replay = await ctx.db.fixedAsset.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
    if (replay) return replay
  }
  const startOn = input.depreciationStartOn ?? input.capitalisedOn
  if (startOn < input.capitalisedOn) throw badRequest('Depreciation cannot start before the asset is capitalised')
  const residualMinor = input.residualMinor ?? defaultResidualMinor(input.costMinor)
  checkAmounts(input.costMinor, residualMinor, input.openingAccumulatedMinor)

  await ensureFixedAssetChart(ctx.db, ctx.tenant.id)
  const accounts = await systemAccounts(ctx.db)
  const assetAccountId = input.assetAccountId || accounts.fixedAssets
  if (!(await assetLedgerOptions(ctx.db)).some((a) => a.id === assetAccountId)) {
    throw badRequest('Choose an asset ledger for the cost (not cash, bank, stock or accumulated depreciation)')
  }
  let fundingAccountId: string | null = null
  if (input.capitalisation === 'POSTED') {
    if (input.openingAccumulatedMinor > 0) {
      throw badRequest('Assets with depreciation brought forward are already in the books; choose "already in the books"')
    }
    const funding = (await fundingOptions(ctx.db)).find((a) => a.id === input.fundingAccountId)
    if (!funding) throw badRequest('Choose the cash, bank or opening balance ledger the asset was paid from')
    fundingAccountId = funding.id
    await assertPostingAllowed(ctx.db, input.capitalisedOn, { startMonth: flags.fiscalYearStartMonth })
  }
  if (input.inventoryAssetId) {
    const linked = await ctx.db.asset.findFirst({ where: { id: input.inventoryAssetId, deletedAt: null }, select: { id: true } })
    if (!linked) throw badRequest('The linked inventory item was not found')
  }
  const cashIds = new Set((await cashBankAccounts(ctx.db)).map((a) => a.id))
  const actor = who(ctx)

  try {
    return await ctx.db.$transaction(async (tx) => {
      const code = await nextDocumentNumber(tx, {
        tenantId: ctx.tenant.id,
        kind: 'FIXED_ASSET',
        sessionLabel: financialYearLabel(attendanceDate(input.capitalisedOn)),
      })
      const asset = await tx.fixedAsset.create({
        data: {
          tenantId: ctx.tenant.id,
          code,
          name: input.name,
          category: input.category,
          location: input.location || null,
          department: input.department || null,
          inventoryAssetId: input.inventoryAssetId || null,
          capitalisedOn: attendanceDate(input.capitalisedOn),
          costMinor: input.costMinor,
          residualMinor,
          usefulLifeMonths: input.usefulLifeMonths ?? null,
          rateBp: input.rateBp,
          depreciationStartOn: attendanceDate(startOn),
          openingAccumulatedMinor: input.openingAccumulatedMinor,
          assetAccountId,
          capitalisation: input.capitalisation,
          fundingAccountId,
          notes: input.notes || null,
          idempotencyKey: input.idempotencyKey ?? null,
          createdById: actor.id,
          createdByLabel: actor.label,
        },
      })
      if (fundingAccountId) {
        await postJournal(tx, ctx, {
          sourceType: 'FIXED_ASSET',
          sourceId: asset.id,
          postingKey: `FIXED_ASSET:${asset.id}:capitalise`,
          date: input.capitalisedOn,
          voucherType: cashIds.has(fundingAccountId) ? 'PAYMENT' : 'JOURNAL',
          narration: `Capitalised ${asset.code} ${asset.name}`,
          reference: asset.code,
          lines: [
            { accountId: assetAccountId, debitMinor: asset.costMinor, creditMinor: 0, memo: asset.name },
            { accountId: fundingAccountId, debitMinor: 0, creditMinor: asset.costMinor, memo: asset.name },
          ],
        })
      }
      await recordAccountingEvent(tx, ctx.tenant.id, {
        entityType: 'FixedAsset', entityId: asset.id, action: 'fixed_asset.created', toStatus: 'ACTIVE',
        actorId: actor.id, actorLabel: actor.label,
        data: { code, costMinor: asset.costMinor, rateBp: asset.rateBp, residualMinor, capitalisation: input.capitalisation },
      })
      return asset
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error, 'idempotencyKey')) {
      const winner = await ctx.db.fixedAsset.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
      if (winner) return winner
    }
    throw error
  }
}

export const fixedAssetUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  location: optionalText(120),
  department: optionalText(120),
  inventoryAssetId: optionalText(40),
  notes: optionalText(1000),
  residualMinor: minor.optional(),
  usefulLifeMonths: z.number().int().min(1).max(1200).nullable().optional(),
  rateBp: z.number().int().min(1).max(10_000).optional(),
  rateReason: z.string().trim().max(500).optional(),
  capitalisedOn: isoDate.optional(),
  costMinor: minor.refine((v) => v > 0).optional(),
  depreciationStartOn: isoDate.optional(),
  openingAccumulatedMinor: minor.optional(),
  assetAccountId: z.string().min(1).optional(),
})

/**
 * Descriptive fields change freely. Depreciation terms change only going
 * forward: once anything is posted, a new rate applies from the day after the
 * last posted line and the change is kept in the rate history. Cost and dates
 * are fixed once depreciation is posted or the capitalisation entry exists.
 */
export async function updateFixedAsset(ctx: AppContext, id: string, raw: unknown) {
  await requireFixedAssets(ctx, 'accounts.manage')
  const input = fixedAssetUpdateSchema.parse(raw)
  const actor = who(ctx)
  return ctx.db.$transaction(async (tx) => {
    await lockAsset(tx, ctx.tenant.id, id)
    const before = await tx.fixedAsset.findFirstOrThrow({ where: { id } })
    const lineCount = await tx.depreciationLine.count({ where: { assetId: id, run: { status: { in: ['SUBMITTED', 'POSTED'] } } } })
    const pending = await tx.depreciationLine.count({ where: { assetId: id, run: { status: 'SUBMITTED' } } })
    const termsChanging = input.residualMinor !== undefined || input.usefulLifeMonths !== undefined || input.rateBp !== undefined
    const structural = (['capitalisedOn', 'costMinor', 'depreciationStartOn', 'openingAccumulatedMinor', 'assetAccountId'] as const)
      .filter((k) => input[k] !== undefined)

    if ((termsChanging || structural.length) && before.status !== 'ACTIVE') throw conflict('Only active assets can be re-termed')
    if ((termsChanging || structural.length) && pending) throw conflict('A depreciation run with this asset is awaiting approval')
    if (structural.length && (lineCount > 0 || before.capitalisation === 'POSTED')) {
      throw conflict('Cost, dates and ledger are fixed once depreciation or a capitalisation entry is posted; cancel and re-enter the asset if they are wrong')
    }
    if (input.inventoryAssetId) {
      const linked = await tx.asset.findFirst({ where: { id: input.inventoryAssetId, deletedAt: null }, select: { id: true } })
      if (!linked) throw badRequest('The linked inventory item was not found')
    }
    if (input.assetAccountId && !(await assetLedgerOptions(tx)).some((a) => a.id === input.assetAccountId)) {
      throw badRequest('Choose an asset ledger for the cost')
    }

    const costMinor = input.costMinor ?? before.costMinor
    const residualMinor = input.residualMinor ?? before.residualMinor
    const openingAccumulatedMinor = input.openingAccumulatedMinor ?? before.openingAccumulatedMinor
    checkAmounts(costMinor, residualMinor, openingAccumulatedMinor)
    const capitalisedOn = input.capitalisedOn ?? toIsoDay(before.capitalisedOn)
    const startOn = input.depreciationStartOn ?? toIsoDay(before.depreciationStartOn)
    if (startOn < capitalisedOn) throw badRequest('Depreciation cannot start before the asset is capitalised')

    const rateChanged = input.rateBp !== undefined && input.rateBp !== before.rateBp
    const hasHistory = rateChanged && (lineCount > 0 || (await tx.fixedAssetRateChange.count({ where: { assetId: id } })) > 0)
    if (hasHistory) {
      if (!input.rateReason || input.rateReason.length < 3) throw badRequest('Give a reason for the rate change')
      const posted = (await postedLines(tx, [id])).get(id) ?? []
      const effectiveFrom = addOneDay(depreciatedThrough({ depreciationStartOn: startOn }, posted))
      await tx.fixedAssetRateChange.create({
        data: {
          tenantId: ctx.tenant.id,
          assetId: id,
          effectiveFrom: attendanceDate(effectiveFrom),
          previousRateBp: before.rateBp,
          rateBp: input.rateBp!,
          reason: input.rateReason,
          changedById: actor.id,
          changedByLabel: actor.label,
        },
      })
    }

    const updated = await tx.fixedAsset.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.location !== undefined ? { location: input.location || null } : {}),
        ...(input.department !== undefined ? { department: input.department || null } : {}),
        ...(input.inventoryAssetId !== undefined ? { inventoryAssetId: input.inventoryAssetId || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.residualMinor !== undefined ? { residualMinor } : {}),
        ...(input.usefulLifeMonths !== undefined ? { usefulLifeMonths: input.usefulLifeMonths } : {}),
        ...(input.rateBp !== undefined ? { rateBp: input.rateBp } : {}),
        ...(input.capitalisedOn !== undefined ? { capitalisedOn: attendanceDate(capitalisedOn) } : {}),
        ...(input.costMinor !== undefined ? { costMinor } : {}),
        ...(input.depreciationStartOn !== undefined ? { depreciationStartOn: attendanceDate(startOn) } : {}),
        ...(input.openingAccumulatedMinor !== undefined ? { openingAccumulatedMinor } : {}),
        ...(input.assetAccountId !== undefined ? { assetAccountId: input.assetAccountId } : {}),
      },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'FixedAsset', entityId: id, action: 'fixed_asset.updated',
      reason: hasHistory ? input.rateReason ?? null : null,
      actorId: actor.id, actorLabel: actor.label,
      data: {
        before: { rateBp: before.rateBp, residualMinor: before.residualMinor, usefulLifeMonths: before.usefulLifeMonths, costMinor: before.costMinor, depreciationStartOn: toIsoDay(before.depreciationStartOn) },
        after: { rateBp: updated.rateBp, residualMinor: updated.residualMinor, usefulLifeMonths: updated.usefulLifeMonths, costMinor: updated.costMinor, depreciationStartOn: toIsoDay(updated.depreciationStartOn) },
      },
    })
    return updated
  }, { isolationLevel: 'Serializable' })
}

function addOneDay(iso: string) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}

/** Removes an asset entered by mistake. Only before any depreciation is posted. */
export async function cancelFixedAsset(ctx: AppContext, id: string, rawReason: unknown) {
  const flags = await requireFixedAssets(ctx, 'accounts.manage')
  const reason = reasonSchema.parse(rawReason)
  const actor = who(ctx)
  return ctx.db.$transaction(async (tx) => {
    await lockAsset(tx, ctx.tenant.id, id)
    const asset = await tx.fixedAsset.findFirstOrThrow({ where: { id } })
    if (asset.status !== 'ACTIVE') throw conflict('Only an active asset can be cancelled')
    const lines = await tx.depreciationLine.count({ where: { assetId: id, run: { status: { in: ['SUBMITTED', 'POSTED'] } } } })
    if (lines) throw conflict('Depreciation has been run on this asset; dispose of it instead, or reverse the runs first')
    if (asset.capitalisation === 'POSTED') {
      await assertPostingAllowed(tx, toIsoDay(asset.capitalisedOn), { startMonth: flags.fiscalYearStartMonth })
      await reverseEntry(tx, ctx, `FIXED_ASSET:${id}:capitalise`, `asset cancelled: ${reason}`)
    }
    const cancelled = await tx.fixedAsset.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, idempotencyKey: null },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'FixedAsset', entityId: id, action: 'fixed_asset.cancelled', fromStatus: 'ACTIVE', toStatus: 'CANCELLED',
      reason, actorId: actor.id, actorLabel: actor.label,
    })
    return cancelled
  }, { isolationLevel: 'Serializable' })
}

export const disposalSchema = z.object({
  disposedOn: isoDate,
  proceedsMinor: minor.default(0),
  proceedsAccountId: z.string().min(1).optional(),
  reason: reasonSchema,
})

/**
 * Sale or scrapping: depreciation up to and including the disposal date, then
 * one balanced entry removing cost and accumulated depreciation, bringing in
 * the proceeds and booking the gain or loss.
 */
export async function disposeFixedAsset(ctx: AppContext, id: string, raw: unknown) {
  const flags = await requireFixedAssets(ctx, 'accounts.manage')
  const input = disposalSchema.parse(raw)
  await assertPostingAllowed(ctx.db, input.disposedOn, { startMonth: flags.fiscalYearStartMonth })
  if (input.disposedOn > schoolToday()) throw badRequest('The disposal date cannot be in the future')
  const cash = (await cashBankAccounts(ctx.db)).filter((a) => a.isActive)
  if (input.proceedsMinor > 0 && !cash.some((a) => a.id === input.proceedsAccountId)) {
    throw badRequest('Choose the cash or bank ledger the sale proceeds went into')
  }
  await ensureFixedAssetChart(ctx.db, ctx.tenant.id)
  const accounts = await systemAccounts(ctx.db)
  const actor = who(ctx)

  return ctx.db.$transaction(async (tx) => {
    await lockAsset(tx, ctx.tenant.id, id)
    const asset = await tx.fixedAsset.findFirstOrThrow({ where: { id } })
    if (asset.status !== 'ACTIVE') throw conflict('Only an active asset can be disposed of')
    if (input.disposedOn < toIsoDay(asset.capitalisedOn)) throw badRequest('The disposal date is before the asset was capitalised')
    if (await tx.depreciationLine.count({ where: { assetId: id, run: { status: 'SUBMITTED' } } })) {
      throw conflict('A depreciation run with this asset is awaiting approval')
    }
    const posted = (await postedLines(tx, [id])).get(id) ?? []
    const terms = assetTerms(asset, (await rateChangesFor(tx, [id])).get(id) ?? [])
    if (depreciatedThrough(terms, posted) > input.disposedOn) {
      throw conflict(`Depreciation is already posted past ${input.disposedOn}; reverse the later run first`)
    }
    const final = computeDepreciation({ ...terms, disposedOn: input.disposedOn }, posted, input.disposedOn, flags.fiscalYearStartMonth)
    const finalMinor = final.reduce((s, l) => s + l.amountMinor, 0)
    const accumulatedBefore = asset.openingAccumulatedMinor + posted.reduce((s, l) => s + l.amountMinor, 0)
    const journal = disposalJournalLines({
      costMinor: asset.costMinor,
      accumulatedBeforeMinor: accumulatedBefore,
      finalDepreciationMinor: finalMinor,
      proceedsMinor: input.proceedsMinor,
      accounts: {
        asset: asset.assetAccountId,
        accumulated: accounts.accumulated,
        expense: accounts.expense,
        proceeds: input.proceedsMinor > 0 ? input.proceedsAccountId! : null,
        gain: accounts.gain,
        loss: accounts.loss,
      },
    })
    const attempt = await tx.journalEntry.count({ where: { sourceType: 'FIXED_ASSET', sourceId: id, isReversal: false, postingKey: { startsWith: `FIXED_ASSET:${id}:dispose:` } } })
    await postJournal(tx, ctx, {
      sourceType: 'FIXED_ASSET',
      sourceId: id,
      postingKey: `FIXED_ASSET:${id}:dispose:${attempt + 1}`,
      date: input.disposedOn,
      voucherType: input.proceedsMinor > 0 ? 'RECEIPT' : 'JOURNAL',
      narration: `Disposal of ${asset.code} ${asset.name}: ${input.reason}`,
      reference: asset.code,
      lines: journal.lines,
    })
    const disposed = await tx.fixedAsset.update({
      where: { id },
      data: {
        status: 'DISPOSED',
        disposedOn: attendanceDate(input.disposedOn),
        disposalProceedsMinor: input.proceedsMinor,
        disposalAccountId: input.proceedsMinor > 0 ? input.proceedsAccountId! : null,
        disposalReason: input.reason,
        disposalDepreciationMinor: finalMinor,
        disposalGainLossMinor: journal.gainLossMinor,
      },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'FixedAsset', entityId: id, action: 'fixed_asset.disposed', fromStatus: 'ACTIVE', toStatus: 'DISPOSED',
      reason: input.reason, actorId: actor.id, actorLabel: actor.label,
      data: { disposedOn: input.disposedOn, proceedsMinor: input.proceedsMinor, finalDepreciationMinor: finalMinor, bookValueMinor: journal.bookValueMinor, gainLossMinor: journal.gainLossMinor },
    })
    return disposed
  }, { isolationLevel: 'Serializable' })
}

/** Undoes a disposal entered in error; the reversal is dated on the disposal date. */
export async function reverseDisposal(ctx: AppContext, id: string, rawReason: unknown) {
  const flags = await requireFixedAssets(ctx, 'accounts.manage')
  const reason = reasonSchema.parse(rawReason)
  const actor = who(ctx)
  return ctx.db.$transaction(async (tx) => {
    await lockAsset(tx, ctx.tenant.id, id)
    const asset = await tx.fixedAsset.findFirstOrThrow({ where: { id } })
    if (asset.status !== 'DISPOSED' || !asset.disposedOn) throw conflict('This asset is not disposed of')
    await assertPostingAllowed(tx, toIsoDay(asset.disposedOn), { startMonth: flags.fiscalYearStartMonth })
    const active = await tx.journalEntry.findFirst({
      where: { sourceType: 'FIXED_ASSET', sourceId: id, isReversal: false, reversedAt: null, postingKey: { startsWith: `FIXED_ASSET:${id}:dispose:` } },
      select: { postingKey: true },
    })
    if (active?.postingKey) await reverseEntry(tx, ctx, active.postingKey, `disposal reversed: ${reason}`)
    const restored = await tx.fixedAsset.update({
      where: { id },
      data: {
        status: 'ACTIVE', disposedOn: null, disposalProceedsMinor: null, disposalAccountId: null,
        disposalReason: null, disposalDepreciationMinor: null, disposalGainLossMinor: null,
      },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'FixedAsset', entityId: id, action: 'fixed_asset.disposal_reversed', fromStatus: 'DISPOSED', toStatus: 'ACTIVE',
      reason, actorId: actor.id, actorLabel: actor.label,
      data: { disposedOn: toIsoDay(asset.disposedOn), gainLossMinor: asset.disposalGainLossMinor },
    })
    return restored
  }, { isolationLevel: 'Serializable' })
}

// ------------------------------------------------------------------ register views

function accumulatedOf(asset: { openingAccumulatedMinor: number; status: string; disposalDepreciationMinor: number | null }, postedMinor: number) {
  return asset.openingAccumulatedMinor + postedMinor + (asset.status === 'DISPOSED' ? asset.disposalDepreciationMinor ?? 0 : 0)
}

export const fixedAssetListSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(['ACTIVE', 'DISPOSED', 'CANCELLED', 'all']).catch('ACTIVE'),
  category: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
})

export async function listFixedAssets(ctx: AppContext, raw: unknown) {
  await requireFixedAssets(ctx, 'accounts.view')
  const filter = fixedAssetListSchema.parse(raw ?? {})
  const pageSize = 50
  const where: Prisma.FixedAssetWhereInput = {
    ...(filter.status === 'all' ? {} : { status: filter.status }),
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.q
      ? { OR: [{ name: { contains: filter.q, mode: 'insensitive' } }, { code: { contains: filter.q, mode: 'insensitive' } }, { location: { contains: filter.q, mode: 'insensitive' } }] }
      : {}),
  }
  const [rows, total, categories, sums, activeAll] = await Promise.all([
    ctx.db.fixedAsset.findMany({ where, orderBy: [{ capitalisedOn: 'desc' }, { code: 'desc' }], skip: (filter.page - 1) * pageSize, take: pageSize }),
    ctx.db.fixedAsset.count({ where }),
    ctx.db.fixedAsset.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
    ctx.db.depreciationLine.groupBy({ by: ['assetId'], where: { run: { status: 'POSTED' } }, _sum: { amountMinor: true } }),
    ctx.db.fixedAsset.findMany({ where: { status: 'ACTIVE' }, select: { id: true, costMinor: true, openingAccumulatedMinor: true, status: true, disposalDepreciationMinor: true } }),
  ])
  const postedBy = new Map(sums.map((s) => [s.assetId, s._sum.amountMinor ?? 0]))
  const withValues = rows.map((a) => {
    const accumulatedMinor = accumulatedOf(a, postedBy.get(a.id) ?? 0)
    return { asset: a, accumulatedMinor, wdvMinor: a.status === 'DISPOSED' || a.status === 'CANCELLED' ? 0 : a.costMinor - accumulatedMinor }
  })
  const totals = activeAll.reduce(
    (t, a) => {
      const acc = accumulatedOf(a, postedBy.get(a.id) ?? 0)
      return { costMinor: t.costMinor + a.costMinor, accumulatedMinor: t.accumulatedMinor + acc, wdvMinor: t.wdvMinor + a.costMinor - acc, assets: t.assets + 1 }
    },
    { costMinor: 0, accumulatedMinor: 0, wdvMinor: 0, assets: 0 },
  )
  return { rows: withValues, total, page: filter.page, pageSize, filter, categories: categories.map((c) => c.category), totals }
}

/** Fixed assets capitalised from one inventory register item, with cost and written-down value; null when not visible. */
export async function fixedAssetsForInventoryItem(ctx: AppContext, inventoryAssetId: string) {
  if (!ctx.can('accounts.view')) return null
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) return null
  const assets = await ctx.db.fixedAsset.findMany({
    where: { inventoryAssetId },
    orderBy: { capitalisedOn: 'asc' },
    select: { id: true, code: true, name: true, status: true, costMinor: true, openingAccumulatedMinor: true, disposalDepreciationMinor: true, method: true, rateBp: true },
  })
  if (!assets.length) return []
  const sums = await ctx.db.depreciationLine.groupBy({
    by: ['assetId'],
    where: { assetId: { in: assets.map((a) => a.id) }, run: { status: 'POSTED' } },
    _sum: { amountMinor: true },
  })
  const postedBy = new Map(sums.map((s) => [s.assetId, s._sum.amountMinor ?? 0]))
  return assets.map((a) => {
    const accumulatedMinor = accumulatedOf(a, postedBy.get(a.id) ?? 0)
    return { ...a, accumulatedMinor, wdvMinor: a.status === 'ACTIVE' ? a.costMinor - accumulatedMinor : 0 }
  })
}

export async function getFixedAsset(ctx: AppContext, id: string) {
  const flags = await requireFixedAssets(ctx, 'accounts.view')
  const asset = await ctx.db.fixedAsset.findFirst({ where: { id } })
  if (!asset) throw notFound('Fixed asset')
  const [lines, changes, frequency, entries, pending] = await Promise.all([
    ctx.db.depreciationLine.findMany({
      where: { assetId: id },
      include: { run: { select: { id: true, number: true, status: true, periodEnd: true } } },
      orderBy: [{ toDate: 'asc' }],
    }),
    ctx.db.fixedAssetRateChange.findMany({ where: { assetId: id }, orderBy: { effectiveFrom: 'asc' } }),
    depreciationFrequency(ctx.db),
    ctx.db.journalEntry.findMany({
      where: { sourceType: 'FIXED_ASSET', sourceId: id },
      select: { id: true, number: true, date: true, narration: true, isReversal: true, reversedAt: true, totalMinor: true },
      orderBy: { createdAt: 'asc' },
    }),
    ctx.db.depreciationLine.count({ where: { assetId: id, run: { status: 'SUBMITTED' } } }),
  ])
  const posted = lines
    .filter((l) => l.run.status === 'POSTED')
    .map((l) => ({ fromDate: toIsoDay(l.fromDate), toDate: toIsoDay(l.toDate), amountMinor: l.amountMinor }))
  const terms = assetTerms(asset, changes)
  const accumulatedMinor = accumulatedOf(asset, posted.reduce((s, l) => s + l.amountMinor, 0))
  const projection = asset.status === 'ACTIVE'
    ? projectSchedule(terms, posted, { frequency, startMonth: flags.fiscalYearStartMonth, periods: frequency === 'MONTHLY' ? 12 : 5 })
    : []
  const accountIds = [asset.assetAccountId, asset.fundingAccountId, asset.disposalAccountId].filter((v): v is string => !!v)
  const [accounts, inventory] = await Promise.all([
    ctx.db.ledgerAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, code: true, name: true } }),
    asset.inventoryAssetId ? ctx.db.asset.findFirst({ where: { id: asset.inventoryAssetId }, select: { id: true, assetCode: true, name: true } }) : null,
  ])
  return {
    asset,
    terms,
    lines,
    rateChanges: changes,
    entries,
    accumulatedMinor,
    wdvMinor: asset.status === 'ACTIVE' ? writtenDownValue(terms, posted) : 0,
    depreciatedThrough: depreciatedThrough(terms, posted),
    fullyDepreciated: isFullyDepreciated(terms, posted),
    projection,
    frequency,
    pendingRun: pending > 0,
    accounts: Object.fromEntries(accounts.map((a) => [a.id, a])),
    inventory,
  }
}

// ------------------------------------------------------------------ runs

export const runRequestSchema = z.object({
  periodEnd: isoDate,
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})

type PlannedLine = ComputedLine & { assetId: string; code: string; name: string }

async function planRun(db: Db, periodEnd: string, startMonth: number): Promise<PlannedLine[]> {
  const assets = await db.fixedAsset.findMany({
    where: { status: 'ACTIVE', depreciationStartOn: { lte: attendanceDate(periodEnd) } },
    orderBy: { code: 'asc' },
  })
  const ids = assets.map((a) => a.id)
  const [posted, changes] = await Promise.all([postedLines(db, ids), rateChangesFor(db, ids)])
  const planned: PlannedLine[] = []
  for (const asset of assets) {
    const lines = computeDepreciation(assetTerms(asset, changes.get(asset.id) ?? []), posted.get(asset.id) ?? [], periodEnd, startMonth)
    for (const line of lines) planned.push({ ...line, assetId: asset.id, code: asset.code, name: asset.name })
  }
  return planned
}

function validatePeriodEnd(periodEnd: string, frequency: DepreciationFrequency, startMonth: number) {
  if (!isPeriodEnd(periodEnd, frequency, startMonth)) {
    throw badRequest(frequency === 'MONTHLY' ? 'Choose the last day of a month' : 'Choose the last day of a financial year')
  }
  const latest = periodContaining(schoolToday(), frequency, startMonth).end
  if (periodEnd > latest) throw badRequest('Depreciation cannot be run for a future period')
}

/** What a run for `periodEnd` would post, without posting anything. */
export async function previewDepreciation(ctx: AppContext, rawPeriodEnd?: string) {
  const flags = await requireFixedAssets(ctx, 'accounts.view')
  const frequency = await depreciationFrequency(ctx.db)
  const periodEnd = rawPeriodEnd && isIsoDate(rawPeriodEnd)
    ? rawPeriodEnd
    : periodContaining(schoolToday(), frequency, flags.fiscalYearStartMonth).end
  const period = periodContaining(periodEnd, frequency, flags.fiscalYearStartMonth)
  const problems: string[] = []
  if (!isPeriodEnd(periodEnd, frequency, flags.fiscalYearStartMonth)) problems.push(frequency === 'MONTHLY' ? 'Choose the last day of a month.' : 'Choose the last day of a financial year.')
  if (periodEnd > periodContaining(schoolToday(), frequency, flags.fiscalYearStartMonth).end) problems.push('That period is in the future.')
  const [pending, existing] = await Promise.all([
    ctx.db.depreciationRun.findFirst({ where: { status: 'SUBMITTED' }, select: { number: true } }),
    ctx.db.depreciationRun.findFirst({ where: { periodKey: periodEnd }, select: { number: true, status: true } }),
  ])
  if (pending) problems.push(`Run ${pending.number} is awaiting approval.`)
  if (existing) problems.push(`Run ${existing.number} already covers this period.`)
  const lines = await planRun(ctx.db, periodEnd, flags.fiscalYearStartMonth)
  if (!lines.length && !problems.length) problems.push('Nothing to depreciate for this period.')
  return {
    frequency,
    periodEnd,
    period,
    lines,
    totalMinor: lines.reduce((s, l) => s + l.amountMinor, 0),
    problems,
    approvals: flags.approvals,
  }
}

async function postRunJournal(tx: Tx, ctx: AppContext, run: { id: string; number: string; periodEnd: Date; totalMinor: number }) {
  const accounts = await systemAccounts(tx)
  return postJournal(tx, ctx, {
    sourceType: 'DEPRECIATION',
    sourceId: run.id,
    postingKey: `DEPRECIATION:${run.id}:post`,
    date: toIsoDay(run.periodEnd),
    voucherType: 'JOURNAL',
    narration: `Depreciation run ${run.number} (WDV) to ${toIsoDay(run.periodEnd)}`,
    reference: run.number,
    lines: depreciationJournalLines(run.totalMinor, accounts),
  })
}

/**
 * Creates a run for one period end. With approvals on it waits as SUBMITTED for
 * a different manager; otherwise it posts at once. One active run per period
 * end (unique index), one pending run at a time, and every line continues from
 * the asset's last posted day, so no asset is ever charged twice for a day.
 */
export async function createDepreciationRun(ctx: AppContext, raw: unknown) {
  const flags = await requireFixedAssets(ctx, 'accounts.manage')
  const input = runRequestSchema.parse(raw)
  const frequency = await depreciationFrequency(ctx.db)
  validatePeriodEnd(input.periodEnd, frequency, flags.fiscalYearStartMonth)
  await assertPostingAllowed(ctx.db, input.periodEnd, { startMonth: flags.fiscalYearStartMonth })
  if (input.idempotencyKey) {
    const replay = await ctx.db.depreciationRun.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
    if (replay) return replay
  }
  await ensureFixedAssetChart(ctx.db, ctx.tenant.id)
  const actor = who(ctx)
  const period = periodContaining(input.periodEnd, frequency, flags.fiscalYearStartMonth)

  try {
    return await ctx.db.$transaction(async (tx) => {
      await lockRuns(tx, ctx.tenant.id)
      if (await tx.depreciationRun.findFirst({ where: { status: 'SUBMITTED' }, select: { id: true } })) {
        throw conflict('Another depreciation run is awaiting approval')
      }
      if (await tx.depreciationRun.findFirst({ where: { periodKey: input.periodEnd }, select: { id: true } })) {
        throw conflict('Depreciation has already been run for this period')
      }
      const planned = await planRun(tx, input.periodEnd, flags.fiscalYearStartMonth)
      if (!planned.length) throw badRequest('Nothing to depreciate for this period')
      const totalMinor = planned.reduce((s, l) => s + l.amountMinor, 0)
      const number = await nextDocumentNumber(tx, { tenantId: ctx.tenant.id, kind: 'DEPRECIATION_RUN', sessionLabel: financialYearLabel(attendanceDate(input.periodEnd)) })
      const status = flags.approvals ? 'SUBMITTED' : 'POSTED'
      const run = await tx.depreciationRun.create({
        data: {
          tenantId: ctx.tenant.id,
          number,
          frequency,
          periodStart: attendanceDate(period.start),
          periodEnd: attendanceDate(input.periodEnd),
          periodKey: input.periodEnd,
          status,
          totalMinor,
          idempotencyKey: input.idempotencyKey ?? null,
          createdById: actor.id,
          createdByLabel: actor.label,
          postedAt: status === 'POSTED' ? new Date() : null,
          lines: {
            create: planned.map((l) => ({
              tenantId: ctx.tenant.id,
              assetId: l.assetId,
              fromDate: attendanceDate(l.fromDate),
              toDate: attendanceDate(l.toDate),
              fiscalYearLabel: l.fiscalYearLabel,
              fyOpeningWdvMinor: l.fyOpeningWdvMinor,
              chargeableDays: l.chargeableDays,
              rateBp: l.rateBp,
              openingWdvMinor: l.openingWdvMinor,
              amountMinor: l.amountMinor,
              closingWdvMinor: l.closingWdvMinor,
              lifeEnd: l.lifeEnd,
            })),
          },
        },
      })
      if (status === 'POSTED') await postRunJournal(tx, ctx, run)
      await recordAccountingEvent(tx, ctx.tenant.id, {
        entityType: 'DepreciationRun', entityId: run.id, action: 'depreciation.run_created', toStatus: status,
        actorId: actor.id, actorLabel: actor.label,
        data: { number, periodEnd: input.periodEnd, frequency, totalMinor, assets: new Set(planned.map((l) => l.assetId)).size },
      })
      return run
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error, 'idempotencyKey')) {
      const winner = await ctx.db.depreciationRun.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
      if (winner) return winner
    }
    if (isUniqueViolation(error, 'periodKey')) throw conflict('Depreciation has already been run for this period')
    throw error
  }
}

/** Approve (posts) or reject a submitted run. The approver must not be the preparer. */
export async function decideDepreciationRun(ctx: AppContext, id: string, decision: 'approve' | 'reject', rawReason?: unknown) {
  const flags = await requireFixedAssets(ctx, 'accounts.manage')
  const reason = decision === 'reject' ? reasonSchema.parse(rawReason) : null
  const actor = who(ctx)
  return ctx.db.$transaction(async (tx) => {
    await lockRuns(tx, ctx.tenant.id)
    const run = await tx.depreciationRun.findFirst({ where: { id }, include: { lines: true } })
    if (!run) throw notFound('Depreciation run')
    if (run.status !== 'SUBMITTED') throw conflict('This run is not awaiting approval')
    if (decision === 'reject') {
      const rejected = await tx.depreciationRun.update({
        where: { id },
        data: { status: 'REJECTED', rejectedById: actor.id, rejectionReason: reason, rejectedAt: new Date(), periodKey: `${run.periodKey}#REJECTED#${id}`, idempotencyKey: null },
      })
      await recordAccountingEvent(tx, ctx.tenant.id, {
        entityType: 'DepreciationRun', entityId: id, action: 'depreciation.run_rejected', fromStatus: 'SUBMITTED', toStatus: 'REJECTED',
        reason, actorId: actor.id, actorLabel: actor.label,
      })
      return rejected
    }
    if (run.createdById && run.createdById === actor.id) throw forbidden('Another authorised user must approve a run you prepared')
    await assertPostingAllowed(tx, toIsoDay(run.periodEnd), { startMonth: flags.fiscalYearStartMonth })
    const replanned = await planRun(tx, toIsoDay(run.periodEnd), flags.fiscalYearStartMonth)
    const key = (l: { assetId: string; fromDate: string; toDate: string; amountMinor: number }) => `${l.assetId}|${l.fromDate}|${l.toDate}|${l.amountMinor}`
    const stored = run.lines.map((l) => key({ assetId: l.assetId, fromDate: toIsoDay(l.fromDate), toDate: toIsoDay(l.toDate), amountMinor: l.amountMinor })).sort()
    if (stored.join() !== replanned.map(key).sort().join()) {
      throw conflict('Assets changed since this run was prepared; reject it and run the period again')
    }
    const approved = await tx.depreciationRun.update({
      where: { id },
      data: { status: 'POSTED', approvedById: actor.id, approvedByLabel: actor.label, approvedAt: new Date(), postedAt: new Date() },
    })
    await postRunJournal(tx, ctx, approved)
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'DepreciationRun', entityId: id, action: 'depreciation.run_approved', fromStatus: 'SUBMITTED', toStatus: 'POSTED',
      actorId: actor.id, actorLabel: actor.label, data: { totalMinor: run.totalMinor },
    })
    return approved
  }, { isolationLevel: 'Serializable' })
}

/**
 * Reverses a posted run, dated on its own period end (which must still be
 * open). Only the latest run for its assets, and only while none of them has
 * been disposed of since.
 */
export async function reverseDepreciationRun(ctx: AppContext, id: string, rawReason: unknown) {
  const flags = await requireFixedAssets(ctx, 'accounts.manage')
  const reason = reasonSchema.parse(rawReason)
  const actor = who(ctx)
  return ctx.db.$transaction(async (tx) => {
    await lockRuns(tx, ctx.tenant.id)
    const run = await tx.depreciationRun.findFirst({ where: { id }, include: { lines: { select: { assetId: true, toDate: true } } } })
    if (!run) throw notFound('Depreciation run')
    if (run.status !== 'POSTED') throw conflict('Only a posted run can be reversed')
    await assertPostingAllowed(tx, toIsoDay(run.periodEnd), { startMonth: flags.fiscalYearStartMonth })
    const assetIds = [...new Set(run.lines.map((l) => l.assetId))]
    const later = await tx.depreciationLine.findFirst({
      where: { assetId: { in: assetIds }, runId: { not: id }, run: { status: { in: ['POSTED', 'SUBMITTED'] }, periodEnd: { gt: run.periodEnd } } },
      include: { run: { select: { number: true } } },
    })
    if (later) throw conflict(`Reverse the later run ${later.run.number} first`)
    const disposed = await tx.fixedAsset.findFirst({ where: { id: { in: assetIds }, status: 'DISPOSED' }, select: { code: true } })
    if (disposed) throw conflict(`${disposed.code} has been disposed of since; reverse the disposal first`)
    await reverseEntry(tx, ctx, `DEPRECIATION:${id}:post`, reason)
    const reversed = await tx.depreciationRun.update({
      where: { id },
      data: { status: 'REVERSED', reversedById: actor.id, reversalReason: reason, reversedAt: new Date(), periodKey: `${run.periodKey}#REVERSED#${id}`, idempotencyKey: null },
    })
    await recordAccountingEvent(tx, ctx.tenant.id, {
      entityType: 'DepreciationRun', entityId: id, action: 'depreciation.run_reversed', fromStatus: 'POSTED', toStatus: 'REVERSED',
      reason, actorId: actor.id, actorLabel: actor.label, data: { totalMinor: run.totalMinor },
    })
    return reversed
  }, { isolationLevel: 'Serializable' })
}

export async function listDepreciationRuns(ctx: AppContext) {
  await requireFixedAssets(ctx, 'accounts.view')
  return ctx.db.depreciationRun.findMany({
    orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
    take: 60,
    include: { _count: { select: { lines: true } } },
  })
}

export async function getDepreciationRun(ctx: AppContext, id: string) {
  await requireFixedAssets(ctx, 'accounts.view')
  const run = await ctx.db.depreciationRun.findFirst({
    where: { id },
    include: { lines: { include: { asset: { select: { code: true, name: true } } }, orderBy: { asset: { code: 'asc' } } } },
  })
  if (!run) throw notFound('Depreciation run')
  const entries = await ctx.db.journalEntry.findMany({
    where: { sourceType: 'DEPRECIATION', sourceId: id },
    select: { id: true, number: true, isReversal: true, date: true },
    orderBy: { createdAt: 'asc' },
  })
  return { run, entries }
}

export async function setDepreciationFrequency(ctx: AppContext, raw: unknown) {
  await requireFixedAssets(ctx, 'accounts.manage')
  const { depreciationFrequency: frequency } = z.object({ depreciationFrequency: z.enum(['MONTHLY', 'YEARLY']) }).parse(raw)
  if (await ctx.db.depreciationRun.findFirst({ where: { status: 'SUBMITTED' }, select: { id: true } })) {
    throw conflict('Approve or reject the pending depreciation run first')
  }
  return saveAccountingSettings(ctx, { depreciationFrequency: frequency })
}

// ------------------------------------------------------------------ reconciliation

/**
 * Register vs ledger as at `asOf`: cost of assets held on that date per asset
 * ledger, and accumulated depreciation (brought forward + posted runs dated on
 * or before it) against the accumulated depreciation ledger.
 */
export async function fixedAssetReconciliation(ctx: AppContext, rawAsOf?: string) {
  await requireFixedAssets(ctx, 'accounts.view')
  const asOf = rawAsOf && isIsoDate(rawAsOf) ? rawAsOf : schoolToday()
  const day = attendanceDate(asOf)
  const accumulatedAccount = await ctx.db.ledgerAccount.findFirst({ where: { systemKey: 'ACCUMULATED_DEPRECIATION' }, select: { id: true } })
  const assets = await ctx.db.fixedAsset.findMany({
    where: {
      status: { not: 'CANCELLED' },
      capitalisedOn: { lte: day },
      OR: [{ disposedOn: null }, { disposedOn: { gt: day } }],
    },
    select: { id: true, assetAccountId: true, costMinor: true, openingAccumulatedMinor: true },
  })
  const sums = assets.length
    ? await ctx.db.depreciationLine.groupBy({
        by: ['assetId'],
        where: { assetId: { in: assets.map((a) => a.id) }, run: { status: 'POSTED', periodEnd: { lte: day } } },
        _sum: { amountMinor: true },
      })
    : []
  const postedBy = new Map(sums.map((s) => [s.assetId, s._sum.amountMinor ?? 0]))
  const ledgerIds = [...new Set([...assets.map((a) => a.assetAccountId), ...(accumulatedAccount ? [accumulatedAccount.id] : [])])]
  const [opening, movement] = await Promise.all([
    ctx.db.ledgerAccount.findMany({ where: { id: { in: ledgerIds } }, select: { id: true, code: true, name: true, openingBalanceMinor: true } }),
    ledgerIds.length
      ? ctx.db.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: ledgerIds }, entry: { date: { lte: day } } }, _sum: { debitMinor: true, creditMinor: true } })
      : Promise.resolve([]),
  ])
  const balances = new Map<string, number>()
  for (const a of opening) {
    const m = movement.find((r) => r.accountId === a.id)
    balances.set(a.id, a.openingBalanceMinor + (m?._sum.debitMinor ?? 0) - (m?._sum.creditMinor ?? 0))
  }
  const result = reconcileAssetRegister({
    assets: assets.map((a) => ({ assetAccountId: a.assetAccountId, costMinor: a.costMinor, accumulatedMinor: a.openingAccumulatedMinor + (postedBy.get(a.id) ?? 0) })),
    ledgerBalances: balances,
    accumulatedAccountId: accumulatedAccount?.id ?? null,
  })
  return { asOf, ...result, accounts: Object.fromEntries(opening.map((a) => [a.id, { code: a.code, name: a.name }])) }
}
