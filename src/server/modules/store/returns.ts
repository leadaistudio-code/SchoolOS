import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { ForbiddenError } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { presetRange } from '@/lib/periods'
import { itemLabel, priceLine } from '@/lib/store/options'
import {
  actorLabel,
  dayBounds,
  issueUnits,
  lockItems,
  movement,
  postLedger,
  receiveUnits,
} from './service'

/* ------------------------------------------------------------------ access */

function requireStoreReturn(ctx: AppContext) {
  if (!ctx.canAny('store.return', 'store.void')) {
    throw new ForbiddenError('You do not have permission to process returns or exchanges')
  }
}

/* ---------------------------------------------------------------- schemas */

const qty = z.coerce.number().int('Use whole numbers').min(1, 'Quantity must be at least 1').max(100_000)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null))

const paymentModeEnum = z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'])
const rupees = (max = 1_000_000) =>
  z.coerce
    .number()
    .min(0, 'Amount cannot be negative')
    .max(max, 'That amount looks wrong')
    .transform((v) => Math.round(v * 100))

/** Exchange replacement bill fields (base store sale object, without student/buyer refinements). */
const storeExchangeSaleSchema = z
  .object({
    paymentMode: z.enum([...paymentModeEnum.options, 'SPLIT']),
    paymentRef: optionalText(80),
    payments: z
      .array(
        z.object({
          mode: paymentModeEnum,
          amount: rupees(),
          reference: optionalText(80),
        }),
      )
      .max(6)
      .optional(),
    notes: optionalText(300),
    feeDue: z.enum(['CURRENT', 'NEXT']).default('CURRENT'),
    lines: z
      .array(z.object({ itemId: z.string().min(1), quantity: qty, discount: rupees().default(0) }))
      .min(1, 'Add at least one item to the bill')
      .max(100),
  })
  .superRefine((v, issue) => {
    if (v.paymentMode !== 'SPLIT') return
    const parts = (v.payments ?? []).filter((p) => p.amount > 0)
    if (parts.length < 2) {
      issue.addIssue({ code: 'custom', path: ['payments'], message: 'A split payment needs at least two parts with an amount' })
    }
  })

const returnLineSchema = z.object({
  saleLineId: z.string().min(1),
  quantity: qty,
})

const returnBaseSchema = z.object({
  saleId: z.string().min(1),
  lines: z.array(returnLineSchema).min(1, 'Pick at least one line to return'),
  notes: optionalText(300),
})

export const storeReturnSchema = returnBaseSchema.extend({
  refundMode: paymentModeEnum.optional(),
})

export const storeExchangeSchema = returnBaseSchema.extend({
  refundMode: paymentModeEnum.optional(),
  collectedMode: paymentModeEnum.optional(),
  exchange: storeExchangeSaleSchema,
})

export type StoreReturnInput = z.input<typeof storeReturnSchema>
export type StoreExchangeInput = z.input<typeof storeExchangeSchema>

/* ------------------------------------------------------------- helpers */

function prorataAmount(amountMinor: number, soldQty: number, returnQty: number) {
  if (returnQty >= soldQty) return amountMinor
  return Math.round((amountMinor * returnQty) / soldQty)
}

async function returnedQtyBySaleLine(db: AppContext['db'], tenantId: string, saleId: string) {
  const rows = await db.storeReturnLine.groupBy({
    by: ['saleLineId'],
    where: { return: { saleId, tenantId } },
    _sum: { quantity: true },
  })
  return new Map(rows.map((r) => [r.saleLineId, r._sum.quantity ?? 0]))
}

type ResolvedReturnLine = {
  saleLineId: string
  itemId: string
  quantity: number
  amountMinor: number
  unitCostMinor: number
}

async function resolveReturnLines(
  db: AppContext['db'],
  tenantId: string,
  sale: { id: string; status: string; lines: Array<{ id: string; itemId: string; quantity: number; amountMinor: number; unitCostMinor: number }> },
  lines: z.infer<typeof returnLineSchema>[],
): Promise<ResolvedReturnLine[]> {
  if (sale.status !== 'COMPLETED') throw conflict('Returns are only allowed against completed bills')
  const already = await returnedQtyBySaleLine(db, tenantId, sale.id)
  const byId = new Map(sale.lines.map((l) => [l.id, l]))
  const merged = new Map<string, number>()
  for (const l of lines) merged.set(l.saleLineId, (merged.get(l.saleLineId) ?? 0) + l.quantity)

  const out: ResolvedReturnLine[] = []
  for (const [saleLineId, quantity] of merged) {
    const sl = byId.get(saleLineId)
    if (!sl) throw badRequest('One of the bill lines is not on this sale')
    const returned = already.get(saleLineId) ?? 0
    const left = sl.quantity - returned
    if (quantity > left) {
      throw badRequest(`Cannot return ${quantity} — only ${Math.max(left, 0)} left on this bill line`)
    }
    if (quantity <= 0) continue
    out.push({
      saleLineId,
      itemId: sl.itemId,
      quantity,
      amountMinor: prorataAmount(sl.amountMinor, sl.quantity, quantity),
      unitCostMinor: sl.unitCostMinor,
    })
  }
  if (!out.length) throw badRequest('Enter a return quantity for at least one line')
  return out
}

async function restoreReturnStock(
  tx: Prisma.TransactionClient,
  ctx: AppContext,
  saleId: string,
  returnId: string,
  returnNumber: string,
  lines: ResolvedReturnLine[],
) {
  const items = await lockItems(tx, ctx.tenant.id, lines.map((l) => l.itemId))
  const movements: string[] = []
  for (const line of lines) {
    const item = items.get(line.itemId)!
    const balance = await receiveUnits(tx, ctx.tenant.id, item, line.quantity, line.unitCostMinor)
    const m = await movement(tx, ctx, {
      itemId: item.id,
      type: 'SALE_RETURN',
      quantity: line.quantity,
      unitCostMinor: line.unitCostMinor,
      balanceAfter: balance,
      saleId,
      returnId,
      reason: `Return ${returnNumber}`,
    })
    movements.push(m.id)
  }
  return movements
}

type ExchangeSaleInput = z.infer<typeof storeExchangeSaleSchema>

async function createReplacementSaleInTx(
  tx: Prisma.TransactionClient,
  ctx: AppContext,
  input: ExchangeSaleInput & {
    studentId: string | null
    customerName: string | null
    customerPhone: string | null
  },
) {
  const parsed = storeExchangeSaleSchema.parse(input)

  const merged = new Map<string, { quantity: number; discount: number }>()
  for (const l of parsed.lines) {
    const prev = merged.get(l.itemId)
    merged.set(l.itemId, {
      quantity: (prev?.quantity ?? 0) + l.quantity,
      discount: (prev?.discount ?? 0) + l.discount,
    })
  }

  const soldAt = new Date()
  const items = await lockItems(tx, ctx.tenant.id, [...merged.keys()])
  const lines = [...merged.entries()].map(([itemId, l]) => {
    const item = items.get(itemId)!
    if (!item.isActive) throw badRequest(`${itemLabel(item)} is no longer sold`)
    const p = priceLine({
      quantity: l.quantity,
      unitPriceMinor: item.sellingPriceMinor,
      discountMinor: l.discount,
      taxPercent: item.taxPercent,
    })
    return { item, quantity: l.quantity, ...p }
  })
  const grossMinor = lines.reduce((s, l) => s + l.gross, 0)
  const discountMinor = lines.reduce((s, l) => s + l.discount, 0)
  const taxMinor = lines.reduce((s, l) => s + l.tax, 0)
  const totalMinor = lines.reduce((s, l) => s + l.amount, 0)
  const costMinor = lines.reduce((s, l) => s + l.quantity * l.item.avgCostMinor, 0)
  if (totalMinor <= 0) throw badRequest('The replacement bill total must be more than zero')

  type PaymentPart = NonNullable<ExchangeSaleInput['payments']>[number]
  const parts: PaymentPart[] = parsed.paymentMode === 'SPLIT' ? (parsed.payments ?? []).filter((p) => p.amount > 0) : []
  if (parsed.paymentMode === 'SPLIT') {
    const partsTotal = parts.reduce((s, p) => s + p.amount, 0)
    if (partsTotal !== totalMinor) {
      throw badRequest(
        `The parts add up to ₹${(partsTotal / 100).toFixed(2)} but the bill is ₹${(totalMinor / 100).toFixed(2)}`,
      )
    }
  }

  const number = await nextDocumentNumber(tx, {
    tenantId: ctx.tenant.id,
    kind: 'STORE_SALE',
    sessionLabel: financialYearLabel(soldAt),
  })
  const created = await tx.storeSale.create({
    data: {
      tenantId: ctx.tenant.id,
      number,
      soldAt,
      studentId: input.studentId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      grossMinor,
      discountMinor,
      taxMinor,
      totalMinor,
      costMinor,
      paymentMode: parsed.paymentMode,
      paymentRef: parsed.paymentMode === 'SPLIT' ? null : parsed.paymentRef,
      notes: parsed.notes,
      soldById: ctx.user.userId,
      soldByLabel: actorLabel(ctx),
      ...(parts.length
        ? {
            payments: {
              create: parts.map((p) => ({
                tenantId: ctx.tenant.id,
                mode: p.mode,
                amountMinor: p.amount,
                reference: p.reference ?? null,
              })),
            },
          }
        : {}),
      lines: {
        create: lines.map((l) => ({
          tenantId: ctx.tenant.id,
          itemId: l.item.id,
          description: itemLabel(l.item),
          quantity: l.quantity,
          unitPriceMinor: l.item.sellingPriceMinor,
          discountMinor: l.discount,
          taxPercent: l.item.taxPercent,
          taxMinor: l.tax,
          amountMinor: l.amount,
          unitCostMinor: l.item.avgCostMinor,
        })),
      },
    },
  })
  for (const l of lines) {
    const balance = await issueUnits(tx, l.item, l.quantity)
    await movement(tx, ctx, {
      itemId: l.item.id,
      type: 'SALE',
      quantity: -l.quantity,
      unitCostMinor: l.item.avgCostMinor,
      balanceAfter: balance,
      saleId: created.id,
      reason: number,
    })
  }
  return { sale: created, totalMinor }
}

/* ----------------------------------------------------------- read APIs */

export type ReturnFilter = { q?: string; preset?: string; kind?: string }

export async function listStoreReturns(ctx: AppContext, filter: ReturnFilter = {}) {
  ctx.require('store.view')
  const where: Prisma.StoreReturnWhereInput = {}
  const range = filter.preset ? presetRange(filter.preset) : null
  if (range) where.createdAt = dayBounds(range.from, range.to)
  if (filter.kind === 'RETURN' || filter.kind === 'EXCHANGE') where.kind = filter.kind
  const q = filter.q?.trim()
  if (q) {
    where.OR = [
      { number: { contains: q, mode: 'insensitive' } },
      { sale: { number: { contains: q, mode: 'insensitive' } } },
      { notes: { contains: q, mode: 'insensitive' } },
      { student: { admissionNo: { contains: q, mode: 'insensitive' } } },
    ]
  }
  return ctx.db.storeReturn.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      sale: { select: { id: true, number: true, customerName: true, soldAt: true } },
      exchangeSale: { select: { id: true, number: true, totalMinor: true } },
      _count: { select: { lines: true } },
    },
  })
}

export async function getStoreReturn(ctx: AppContext, id: string) {
  ctx.require('store.view')
  const row = await ctx.db.storeReturn.findFirst({
    where: { id },
    include: {
      sale: {
        select: {
          id: true,
          number: true,
          soldAt: true,
          customerName: true,
          totalMinor: true,
          student: { select: { admissionNo: true, firstName: true, lastName: true } },
        },
      },
      exchangeSale: {
        include: {
          lines: { include: { item: { select: { sku: true, unit: true } } } },
          payments: { orderBy: { createdAt: 'asc' } },
        },
      },
      lines: {
        include: {
          item: { select: { name: true, variant: true, sku: true, unit: true } },
          saleLine: { select: { description: true, quantity: true, amountMinor: true } },
        },
      },
    },
  })
  if (!row) throw notFound('Store return')
  return row
}

export async function getSaleReturnableLines(ctx: AppContext, saleId: string) {
  ctx.require('store.view')
  const sale = await ctx.db.storeSale.findFirst({
    where: { id: saleId },
    include: {
      lines: {
        orderBy: { id: 'asc' },
        include: { item: { select: { sku: true, unit: true } } },
      },
      student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } },
    },
  })
  if (!sale) throw notFound('Store bill')
  if (sale.status !== 'COMPLETED') throw conflict('Only completed bills can be returned or exchanged')
  const already = await returnedQtyBySaleLine(ctx.db, ctx.tenant.id, saleId)
  const lines = sale.lines.map((l) => {
    const returned = already.get(l.id) ?? 0
    const returnableQty = Math.max(0, l.quantity - returned)
    return {
      ...l,
      returnedQty: returned,
      returnableQty,
      unitReturnMinor: l.quantity > 0 ? Math.round(l.amountMinor / l.quantity) : 0,
    }
  })
  return { sale, lines }
}

/* ---------------------------------------------------------- create RETURN */

export async function createStoreReturn(ctx: AppContext, raw: StoreReturnInput) {
  requireStoreReturn(ctx)
  const input = storeReturnSchema.parse(raw)

  const sale = await ctx.db.storeSale.findFirst({
    where: { id: input.saleId },
    include: { lines: true },
  })
  if (!sale) throw notFound('Store bill')

  const resolved = await resolveReturnLines(ctx.db, ctx.tenant.id, sale, input.lines)
  const returnValue = resolved.reduce((s, l) => s + l.amountMinor, 0)
  const refundMinor = returnValue
  if (refundMinor > 0 && !input.refundMode) {
    throw badRequest('Choose how the refund is paid (cash, UPI, etc.)')
  }

  const createdAt = new Date()
  const { record, movementIds } = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    await tx.$queryRawUnsafe(
      `SELECT id FROM "StoreSale" WHERE id = $1 AND "tenantId" = $2 FOR UPDATE`,
      sale.id,
      ctx.tenant.id,
    )
    const again = await resolveReturnLines(tx as unknown as AppContext['db'], ctx.tenant.id, sale, input.lines)
    const number = await nextDocumentNumber(tx, {
      tenantId: ctx.tenant.id,
      kind: 'STORE_RETURN',
      sessionLabel: financialYearLabel(createdAt),
    })
    const record = await tx.storeReturn.create({
      data: {
        tenantId: ctx.tenant.id,
        number,
        saleId: sale.id,
        kind: 'RETURN',
        studentId: sale.studentId,
        refundMinor,
        refundMode: refundMinor > 0 ? input.refundMode! : null,
        notes: input.notes,
        createdById: ctx.user.userId,
        createdByLabel: actorLabel(ctx),
        lines: {
          create: again.map((l) => ({
            tenantId: ctx.tenant.id,
            saleLineId: l.saleLineId,
            itemId: l.itemId,
            quantity: l.quantity,
            amountMinor: l.amountMinor,
            unitCostMinor: l.unitCostMinor,
          })),
        },
      },
      include: { lines: true },
    })
    const movementIds = await restoreReturnStock(tx, ctx, sale.id, record.id, number, again)
    return { record, movementIds }
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'store.return_create',
    module: 'store',
    entityType: 'StoreReturn',
    entityId: record.id,
    summary: `Return ${record.number} against bill ${sale.number}: ₹${refundMinor / 100} refunded`,
    after: record,
  })
  for (const id of movementIds) postLedger(ctx.tenant.id, 'movement', id)
  return record
}

/* -------------------------------------------------------- create EXCHANGE */

export async function createStoreExchange(ctx: AppContext, raw: StoreExchangeInput) {
  requireStoreReturn(ctx)
  const input = storeExchangeSchema.parse(raw)

  const sale = await ctx.db.storeSale.findFirst({
    where: { id: input.saleId },
    include: { lines: true },
  })
  if (!sale) throw notFound('Store bill')

  const createdAt = new Date()
  const result = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    await tx.$queryRawUnsafe(
      `SELECT id FROM "StoreSale" WHERE id = $1 AND "tenantId" = $2 FOR UPDATE`,
      sale.id,
      ctx.tenant.id,
    )
    const resolved = await resolveReturnLines(tx as unknown as AppContext['db'], ctx.tenant.id, sale, input.lines)
    const returnValue = resolved.reduce((s, l) => s + l.amountMinor, 0)

    const number = await nextDocumentNumber(tx, {
      tenantId: ctx.tenant.id,
      kind: 'STORE_RETURN',
      sessionLabel: financialYearLabel(createdAt),
    })

    const { sale: exchangeSale, totalMinor: exchangeTotal } = await createReplacementSaleInTx(tx, ctx, {
      ...input.exchange,
      studentId: sale.studentId,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
    })

    let refundMinor = 0
    let refundMode: string | null = null
    let collectedMinor = 0
    let collectedMode: string | null = null
    const diff = exchangeTotal - returnValue
    if (diff > 0) {
      collectedMinor = diff
      collectedMode = input.collectedMode ?? input.exchange.paymentMode
      if (collectedMode === 'SPLIT') collectedMode = input.collectedMode ?? 'CASH'
    } else if (diff < 0) {
      refundMinor = -diff
      refundMode = input.refundMode ?? null
      if (refundMinor > 0 && !refundMode) throw badRequest('Choose how the balance refund is paid')
    }

    const record = await tx.storeReturn.create({
      data: {
        tenantId: ctx.tenant.id,
        number,
        saleId: sale.id,
        kind: 'EXCHANGE',
        studentId: sale.studentId,
        refundMinor,
        refundMode,
        collectedMinor,
        collectedMode,
        exchangeSaleId: exchangeSale.id,
        notes: input.notes,
        createdById: ctx.user.userId,
        createdByLabel: actorLabel(ctx),
        lines: {
          create: resolved.map((l) => ({
            tenantId: ctx.tenant.id,
            saleLineId: l.saleLineId,
            itemId: l.itemId,
            quantity: l.quantity,
            amountMinor: l.amountMinor,
            unitCostMinor: l.unitCostMinor,
          })),
        },
      },
      include: { lines: true, exchangeSale: { select: { id: true, number: true, totalMinor: true } } },
    })
    const movementIds = await restoreReturnStock(tx, ctx, sale.id, record.id, number, resolved)
    return { record, movementIds, exchangeSale }
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'store.exchange_create',
    module: 'store',
    entityType: 'StoreReturn',
    entityId: result.record.id,
    summary: `Exchange ${result.record.number}: bill ${sale.number} → new bill ${result.exchangeSale.number}`,
    after: result.record,
  })
  postLedger(ctx.tenant.id, 'sale', result.exchangeSale.id)
  for (const id of result.movementIds) postLedger(ctx.tenant.id, 'movement', id)
  return {
    record: result.record,
    exchangeSale: result.exchangeSale,
  }
}