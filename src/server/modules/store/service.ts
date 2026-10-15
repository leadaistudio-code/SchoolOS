import { z } from 'zod'
import type { Prisma, StockMovementType, StoreCategory } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { attendanceDate } from '@/lib/dates'
import { presetRange, schoolToday } from '@/lib/periods'
import {
  STORE_CATEGORIES,
  itemLabel,
  priceLine,
  storeCategory,
  weightedAverageCost,
} from '@/lib/store/options'

/* ---------------------------------------------------------------- schemas */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
const rupees = (max = 1_000_000) =>
  z.coerce
    .number()
    .min(0, 'Amount cannot be negative')
    .max(max, 'That amount looks wrong')
    .transform((v) => Math.round(v * 100))
const qty = z.coerce.number().int('Use whole numbers').min(1, 'Quantity must be at least 1').max(100_000)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null))

const categoryEnum = z.enum(STORE_CATEGORIES.map((c) => c.value) as [StoreCategory, ...StoreCategory[]])
const paymentModeEnum = z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'])

const itemFields = {
  name: z.string().trim().min(2, 'Enter the item name').max(120),
  category: categoryEnum,
  variant: optionalText(60),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  sku: optionalText(40),
  barcode: optionalText(60),
  hsnCode: optionalText(20),
  taxPercent: z.coerce.number().min(0).max(28).default(0),
  sellingPrice: rupees().refine((v) => v > 0, 'Enter the selling price'),
  reorderLevel: z.coerce.number().int().min(0).max(100_000).default(0),
  description: optionalText(500),
}

export const storeItemSchema = z.object({
  ...itemFields,
  openingQuantity: z.coerce.number().int().min(0).max(100_000).default(0),
  openingUnitCost: rupees().default(0),
})

export const storeItemUpdateSchema = z.object({ id: z.string().min(1), ...itemFields })

export const storePurchaseSchema = z.object({
  vendorName: z.string().trim().min(2, 'Enter the vendor / supplier').max(120),
  /** Optional link to the vendor master; the receipt then shows on Vendor 360. */
  vendorId: z.string().trim().max(40).optional().nullable().transform((v) => v || null),
  invoiceNo: optionalText(60),
  purchaseDate: isoDate,
  paymentMode: paymentModeEnum,
  notes: optionalText(500),
  lines: z
    .array(z.object({ itemId: z.string().min(1), quantity: qty, unitCost: rupees() }))
    .min(1, 'Add at least one item'),
})

export const storeSaleSchema = z
  .object({
    studentId: z.string().min(1).optional().nullable(),
    customerName: optionalText(120),
    customerPhone: optionalText(20),
    paymentMode: paymentModeEnum,
    paymentRef: optionalText(80),
    notes: optionalText(300),
    lines: z
      .array(z.object({ itemId: z.string().min(1), quantity: qty, discount: rupees().default(0) }))
      .min(1, 'Add at least one item to the bill')
      .max(100),
  })
  .refine((v) => v.studentId || v.customerName, {
    message: 'Pick a student or enter the buyer name',
    path: ['customerName'],
  })

export const stockAdjustmentSchema = z.object({
  itemId: z.string().min(1),
  direction: z.enum(['IN', 'OUT']),
  quantity: qty,
  reason: z.string().trim().min(2, 'Give a reason').max(200),
})

export type StoreSaleInput = z.input<typeof storeSaleSchema>
export type StorePurchaseInput = z.input<typeof storePurchaseSchema>

/* ---------------------------------------------------------------- helpers */

const actorLabel = (ctx: AppContext) => `${ctx.user.firstName} ${ctx.user.lastName}`.trim()

type LockedItem = {
  id: string
  name: string
  variant: string | null
  quantity: number
  avgCostMinor: number
  sellingPriceMinor: number
  taxPercent: number
  isActive: boolean
}

/** Row-locks the items in id order so concurrent bills queue instead of overselling. */
async function lockItems(tx: Prisma.TransactionClient, tenantId: string, ids: string[]) {
  const unique = [...new Set(ids)].sort()
  const rows = await tx.$queryRawUnsafe<LockedItem[]>(
    `SELECT id, name, variant, quantity, "avgCostMinor", "sellingPriceMinor", "taxPercent", "isActive"
       FROM "StoreItem"
      WHERE "tenantId" = $1 AND id = ANY($2::text[])
      ORDER BY id
        FOR UPDATE`,
    tenantId,
    unique,
  )
  const map = new Map(rows.map((r) => [r.id, r]))
  for (const id of unique) if (!map.has(id)) throw notFound('Store item')
  return map
}

async function receiveUnits(
  tx: Prisma.TransactionClient,
  tenantId: string,
  item: LockedItem,
  quantity: number,
  unitCostMinor: number,
) {
  const avg = weightedAverageCost(item.quantity, item.avgCostMinor, quantity, unitCostMinor)
  const balance = item.quantity + quantity
  await tx.storeItem.update({ where: { id: item.id }, data: { quantity: balance, avgCostMinor: avg } })
  item.quantity = balance
  item.avgCostMinor = avg
  return balance
}

async function issueUnits(tx: Prisma.TransactionClient, item: LockedItem, quantity: number) {
  if (item.quantity < quantity) {
    throw conflict(`Only ${Math.max(item.quantity, 0)} of ${itemLabel(item)} left in stock`)
  }
  const balance = item.quantity - quantity
  await tx.storeItem.update({ where: { id: item.id }, data: { quantity: balance } })
  item.quantity = balance
  return balance
}

async function movement(
  tx: Prisma.TransactionClient,
  ctx: AppContext,
  data: {
    itemId: string
    type: StockMovementType
    quantity: number
    unitCostMinor: number
    balanceAfter: number
    saleId?: string
    purchaseId?: string
    reason?: string | null
  },
) {
  return tx.stockMovement.create({
    data: { tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: actorLabel(ctx), ...data },
  })
}

async function uniqueSku(ctx: AppContext, category: StoreCategory) {
  const prefix = storeCategory(category).prefix
  const count = await ctx.db.storeItem.count({ where: { category } })
  for (let n = count + 1; n < count + 500; n++) {
    const sku = `${prefix}-${String(n).padStart(4, '0')}`
    const taken = await ctx.db.storeItem.findFirst({ where: { sku }, select: { id: true } })
    if (!taken) return sku
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`
}

type LedgerHook = 'sale' | 'purchase' | 'movement'

function postLedger(tenantId: string, kind: LedgerHook, id: string) {
  void import('@/server/modules/accounts/posting')
    .then((m) =>
      kind === 'sale'
        ? m.syncStoreSaleLedger(tenantId, id)
        : kind === 'purchase'
          ? m.syncStorePurchaseLedger(tenantId, id)
          : m.syncStockMovementLedger(tenantId, id),
    )
    .catch((err) => console.error('[ledger] store hook failed', err))
}

function dayBounds(from: string, to: string) {
  return { gte: new Date(`${from}T00:00:00+05:30`), lte: new Date(`${to}T23:59:59.999+05:30`) }
}

/* ------------------------------------------------------------------ items */

export type ItemFilter = {
  q?: string
  category?: string
  stock?: 'low' | 'out' | 'ok'
  status?: 'active' | 'inactive' | 'all'
}

export async function listStoreItems(ctx: AppContext, filter: ItemFilter = {}) {
  ctx.require('store.view')
  const where: Prisma.StoreItemWhereInput = {}
  if (filter.status !== 'all') where.isActive = filter.status !== 'inactive'
  if (filter.category && STORE_CATEGORIES.some((c) => c.value === filter.category)) {
    where.category = filter.category as StoreCategory
  }
  const q = filter.q?.trim()
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
      { barcode: q },
      { variant: { contains: q, mode: 'insensitive' } },
    ]
  }
  const items = await ctx.db.storeItem.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }, { variant: 'asc' }],
    take: 2000,
  })
  const filtered = filter.stock
    ? items.filter((i) =>
        filter.stock === 'out'
          ? i.quantity <= 0
          : filter.stock === 'low'
            ? i.quantity > 0 && i.quantity <= i.reorderLevel
            : i.quantity > i.reorderLevel,
      )
    : items
  return filtered
}

/** Lightweight active-item list for the POS and stock-in pickers. */
export async function storeCatalogue(ctx: AppContext) {
  ctx.require('store.view')
  return ctx.db.storeItem.findMany({
    where: { isActive: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }, { variant: 'asc' }],
    select: {
      id: true,
      sku: true,
      barcode: true,
      name: true,
      variant: true,
      category: true,
      unit: true,
      sellingPriceMinor: true,
      avgCostMinor: true,
      taxPercent: true,
      quantity: true,
      reorderLevel: true,
    },
    take: 3000,
  })
}

export async function getStoreItem(ctx: AppContext, id: string) {
  ctx.require('store.view')
  const item = await ctx.db.storeItem.findFirst({ where: { id } })
  if (!item) throw notFound('Store item')
  const movements = await ctx.db.stockMovement.findMany({
    where: { itemId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return { item, movements }
}

export async function createStoreItem(ctx: AppContext, raw: z.input<typeof storeItemSchema>) {
  ctx.require('store.manage')
  const input = storeItemSchema.parse(raw)
  const sku = input.sku ?? (await uniqueSku(ctx, input.category))
  const clash = await ctx.db.storeItem.findFirst({ where: { sku }, select: { id: true } })
  if (clash) throw conflict(`SKU ${sku} is already used by another item`)
  if (input.openingQuantity > 0 && input.openingUnitCost <= 0) {
    throw badRequest('Enter the purchase cost of the opening stock so stock value is right')
  }

  const result = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    const item = await tx.storeItem.create({
      data: {
        tenantId: ctx.tenant.id,
        sku,
        name: input.name,
        category: input.category,
        variant: input.variant,
        unit: input.unit,
        barcode: input.barcode,
        hsnCode: input.hsnCode,
        taxPercent: input.taxPercent,
        sellingPriceMinor: input.sellingPrice,
        reorderLevel: input.reorderLevel,
        description: input.description,
        quantity: input.openingQuantity,
        avgCostMinor: input.openingUnitCost,
      },
    })
    let openingId: string | null = null
    if (input.openingQuantity > 0) {
      const m = await movement(tx, ctx, {
        itemId: item.id,
        type: 'OPENING',
        quantity: input.openingQuantity,
        unitCostMinor: input.openingUnitCost,
        balanceAfter: input.openingQuantity,
        reason: 'Opening stock',
      })
      openingId = m.id
    }
    return { item, openingId }
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'store.item_create',
    module: 'store',
    entityType: 'StoreItem',
    entityId: result.item.id,
    summary: `Added store item ${itemLabel(result.item)} (${sku}) with ${input.openingQuantity} in stock`,
    after: result.item,
  })
  if (result.openingId) postLedger(ctx.tenant.id, 'movement', result.openingId)
  return result.item
}

export async function updateStoreItem(ctx: AppContext, raw: z.input<typeof storeItemUpdateSchema>) {
  ctx.require('store.manage')
  const input = storeItemUpdateSchema.parse(raw)
  const before = await ctx.db.storeItem.findFirst({ where: { id: input.id } })
  if (!before) throw notFound('Store item')
  const sku = input.sku ?? before.sku
  if (sku !== before.sku) {
    const clash = await ctx.db.storeItem.findFirst({ where: { sku, NOT: { id: before.id } }, select: { id: true } })
    if (clash) throw conflict(`SKU ${sku} is already used by another item`)
  }
  const updated = await ctx.db.storeItem.update({
    where: { id: before.id },
    data: {
      sku,
      name: input.name,
      category: input.category,
      variant: input.variant,
      unit: input.unit,
      barcode: input.barcode,
      hsnCode: input.hsnCode,
      taxPercent: input.taxPercent,
      sellingPriceMinor: input.sellingPrice,
      reorderLevel: input.reorderLevel,
      description: input.description,
    },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'store.item_update',
    module: 'store',
    entityType: 'StoreItem',
    entityId: updated.id,
    summary: `Updated store item ${itemLabel(updated)}`,
    before,
    after: updated,
  })
  return updated
}

export async function setStoreItemActive(ctx: AppContext, id: string, active: boolean) {
  ctx.require('store.manage')
  const before = await ctx.db.storeItem.findFirst({ where: { id } })
  if (!before) throw notFound('Store item')
  const updated = await ctx.db.storeItem.update({ where: { id }, data: { isActive: active } })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: active ? 'store.item_activate' : 'store.item_deactivate',
    module: 'store',
    entityType: 'StoreItem',
    entityId: id,
    summary: `${active ? 'Re-activated' : 'Stopped selling'} ${itemLabel(before)}`,
  })
  return updated
}

/* ------------------------------------------------------------ adjustments */

export async function adjustStock(ctx: AppContext, raw: z.input<typeof stockAdjustmentSchema>) {
  ctx.require('store.manage')
  const input = stockAdjustmentSchema.parse(raw)

  const m = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    const items = await lockItems(tx, ctx.tenant.id, [input.itemId])
    const item = items.get(input.itemId)!
    const cost = item.avgCostMinor
    const balance =
      input.direction === 'IN'
        ? await receiveUnits(tx, ctx.tenant.id, item, input.quantity, cost)
        : await issueUnits(tx, item, input.quantity)
    return movement(tx, ctx, {
      itemId: item.id,
      type: input.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantity: input.direction === 'IN' ? input.quantity : -input.quantity,
      unitCostMinor: cost,
      balanceAfter: balance,
      reason: input.reason,
    }).then((created) => ({ created, item }))
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'store.stock_adjust',
    module: 'store',
    entityType: 'StoreItem',
    entityId: input.itemId,
    summary: `${input.direction === 'IN' ? 'Added' : 'Removed'} ${input.quantity} × ${itemLabel(m.item)}: ${input.reason}`,
    after: m.created,
  })
  postLedger(ctx.tenant.id, 'movement', m.created.id)
  return m.created
}

/* -------------------------------------------------------------- purchases */

export async function createStorePurchase(ctx: AppContext, raw: StorePurchaseInput) {
  ctx.require('store.manage')
  const input = storePurchaseSchema.parse(raw)
  const purchaseDate = attendanceDate(input.purchaseDate)
  if (input.purchaseDate > schoolToday()) throw badRequest('The receipt date cannot be in the future')
  if (input.vendorId && !(await ctx.db.vendor.findFirst({ where: { id: input.vendorId }, select: { id: true } }))) {
    throw badRequest('That vendor does not exist')
  }

  const purchase = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    const items = await lockItems(tx, ctx.tenant.id, input.lines.map((l) => l.itemId))
    const totalMinor = input.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    const number = await nextDocumentNumber(tx, {
      tenantId: ctx.tenant.id,
      kind: 'STORE_PURCHASE',
      sessionLabel: financialYearLabel(purchaseDate),
    })
    const created = await tx.storePurchase.create({
      data: {
        tenantId: ctx.tenant.id,
        number,
        vendorName: input.vendorName,
        vendorId: input.vendorId,
        invoiceNo: input.invoiceNo,
        purchaseDate,
        paymentMode: input.paymentMode,
        totalMinor,
        notes: input.notes,
        createdById: ctx.user.userId,
        createdByLabel: actorLabel(ctx),
        lines: {
          create: input.lines.map((l) => ({
            tenantId: ctx.tenant.id,
            itemId: l.itemId,
            quantity: l.quantity,
            unitCostMinor: l.unitCost,
            amountMinor: l.quantity * l.unitCost,
          })),
        },
      },
    })
    for (const line of input.lines) {
      const item = items.get(line.itemId)!
      const balance = await receiveUnits(tx, ctx.tenant.id, item, line.quantity, line.unitCost)
      await movement(tx, ctx, {
        itemId: item.id,
        type: 'PURCHASE',
        quantity: line.quantity,
        unitCostMinor: line.unitCost,
        balanceAfter: balance,
        purchaseId: created.id,
        reason: `${number} from ${input.vendorName}`,
      })
    }
    return created
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'store.purchase_create',
    module: 'store',
    entityType: 'StorePurchase',
    entityId: purchase.id,
    summary: `Received stock ${purchase.number} from ${purchase.vendorName} worth ₹${purchase.totalMinor / 100}`,
    after: purchase,
  })
  postLedger(ctx.tenant.id, 'purchase', purchase.id)
  return purchase
}

export async function listStorePurchases(ctx: AppContext, filter: { q?: string; preset?: string } = {}) {
  ctx.require('store.view')
  const where: Prisma.StorePurchaseWhereInput = {}
  const range = filter.preset ? presetRange(filter.preset) : null
  if (range) where.purchaseDate = { gte: attendanceDate(range.from), lte: attendanceDate(range.to) }
  const q = filter.q?.trim()
  if (q) {
    where.OR = [
      { number: { contains: q, mode: 'insensitive' } },
      { vendorName: { contains: q, mode: 'insensitive' } },
      { invoiceNo: { contains: q, mode: 'insensitive' } },
    ]
  }
  return ctx.db.storePurchase.findMany({
    where,
    orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    include: { _count: { select: { lines: true } } },
  })
}

export async function getStorePurchase(ctx: AppContext, id: string) {
  ctx.require('store.view')
  const purchase = await ctx.db.storePurchase.findFirst({
    where: { id },
    include: { lines: { include: { item: { select: { name: true, variant: true, sku: true, unit: true } } } } },
  })
  if (!purchase) throw notFound('Stock receipt')
  return purchase
}

/* ------------------------------------------------------------------ sales */

export async function createStoreSale(ctx: AppContext, raw: StoreSaleInput) {
  ctx.require('store.sell')
  const input = storeSaleSchema.parse(raw)

  let student: { id: string; firstName: string; lastName: string } | null = null
  if (input.studentId) {
    student = await ctx.db.student.findFirst({
      where: { id: input.studentId },
      select: { id: true, firstName: true, lastName: true },
    })
    if (!student) throw notFound('Student')
  }

  const merged = new Map<string, { quantity: number; discount: number }>()
  for (const l of input.lines) {
    const prev = merged.get(l.itemId)
    merged.set(l.itemId, {
      quantity: (prev?.quantity ?? 0) + l.quantity,
      discount: (prev?.discount ?? 0) + l.discount,
    })
  }

  const soldAt = new Date()
  const sale = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
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
    if (totalMinor <= 0) throw badRequest('The bill total must be more than zero')

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
        studentId: student?.id ?? null,
        customerName: input.customerName ?? (student ? `${student.firstName} ${student.lastName}`.trim() : null),
        customerPhone: input.customerPhone,
        grossMinor,
        discountMinor,
        taxMinor,
        totalMinor,
        costMinor,
        paymentMode: input.paymentMode,
        paymentRef: input.paymentRef,
        notes: input.notes,
        soldById: ctx.user.userId,
        soldByLabel: actorLabel(ctx),
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
    return created
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'store.sale_create',
    module: 'store',
    entityType: 'StoreSale',
    entityId: sale.id,
    summary: `Store bill ${sale.number} for ${sale.customerName ?? 'walk-in'}: ₹${sale.totalMinor / 100} (${sale.paymentMode})`,
    after: sale,
  })
  postLedger(ctx.tenant.id, 'sale', sale.id)
  return sale
}

export async function voidStoreSale(ctx: AppContext, id: string, reason: string) {
  ctx.require('store.void')
  const why = reason.trim()
  if (why.length < 3) throw badRequest('Give a reason for voiding the bill')

  const sale = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    const locked = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
      `SELECT id, status FROM "StoreSale" WHERE id = $1 AND "tenantId" = $2 FOR UPDATE`,
      id,
      ctx.tenant.id,
    )
    if (!locked[0]) throw notFound('Store bill')
    if (locked[0].status === 'VOIDED') throw conflict('This bill is already voided')

    const current = await tx.storeSale.findFirst({ where: { id }, include: { lines: true } })
    if (!current) throw notFound('Store bill')
    const items = await lockItems(tx, ctx.tenant.id, current.lines.map((l) => l.itemId))
    for (const line of current.lines) {
      const item = items.get(line.itemId)!
      const balance = await receiveUnits(tx, ctx.tenant.id, item, line.quantity, line.unitCostMinor)
      await movement(tx, ctx, {
        itemId: item.id,
        type: 'SALE_RETURN',
        quantity: line.quantity,
        unitCostMinor: line.unitCostMinor,
        balanceAfter: balance,
        saleId: current.id,
        reason: `Voided ${current.number}: ${why}`,
      })
    }
    return tx.storeSale.update({
      where: { id },
      data: { status: 'VOIDED', voidedAt: new Date(), voidReason: why, voidedById: ctx.user.userId },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'store.sale_void',
    module: 'store',
    entityType: 'StoreSale',
    entityId: sale.id,
    summary: `Voided store bill ${sale.number} (₹${sale.totalMinor / 100}): ${why}`,
  })
  postLedger(ctx.tenant.id, 'sale', sale.id)
  return sale
}

export type SaleFilter = { q?: string; preset?: string; status?: string; mode?: string }

function saleWhere(filter: SaleFilter): Prisma.StoreSaleWhereInput {
  const where: Prisma.StoreSaleWhereInput = {}
  const range = filter.preset ? presetRange(filter.preset) : null
  if (range) where.soldAt = dayBounds(range.from, range.to)
  if (filter.status === 'COMPLETED' || filter.status === 'VOIDED') where.status = filter.status
  if (filter.mode) where.paymentMode = filter.mode
  const q = filter.q?.trim()
  if (q) {
    where.OR = [
      { number: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q } },
      { student: { admissionNo: { contains: q, mode: 'insensitive' } } },
    ]
  }
  return where
}

export async function listStoreSales(ctx: AppContext, filter: SaleFilter = {}) {
  ctx.require('store.view')
  const where = saleWhere(filter)
  const [sales, totals] = await Promise.all([
    ctx.db.storeSale.findMany({
      where,
      orderBy: { soldAt: 'desc' },
      take: 500,
      include: {
        student: { select: { admissionNo: true, firstName: true, lastName: true } },
        _count: { select: { lines: true } },
      },
    }),
    ctx.db.storeSale.aggregate({
      where: { ...where, status: 'COMPLETED' },
      _sum: { totalMinor: true, taxMinor: true, costMinor: true, discountMinor: true },
      _count: true,
    }),
  ])
  return {
    sales,
    totals: {
      count: totals._count,
      totalMinor: totals._sum.totalMinor ?? 0,
      taxMinor: totals._sum.taxMinor ?? 0,
      costMinor: totals._sum.costMinor ?? 0,
      discountMinor: totals._sum.discountMinor ?? 0,
    },
  }
}

export async function getStoreSale(ctx: AppContext, id: string) {
  ctx.require('store.view')
  const sale = await ctx.db.storeSale.findFirst({
    where: { id },
    include: {
      lines: { include: { item: { select: { sku: true, hsnCode: true, unit: true } } } },
      student: {
        select: {
          admissionNo: true,
          firstName: true,
          lastName: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      },
    },
  })
  if (!sale) throw notFound('Store bill')
  return sale
}

/* -------------------------------------------------------------- movements */

export type MovementFilter = { itemId?: string; type?: string; preset?: string }

export async function listStockMovements(ctx: AppContext, filter: MovementFilter = {}) {
  ctx.require('store.view')
  const where: Prisma.StockMovementWhereInput = {}
  if (filter.itemId) where.itemId = filter.itemId
  const types = ['OPENING', 'PURCHASE', 'SALE', 'SALE_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']
  if (filter.type && types.includes(filter.type)) where.type = filter.type as StockMovementType
  const range = filter.preset ? presetRange(filter.preset) : null
  if (range) where.createdAt = dayBounds(range.from, range.to)
  return ctx.db.stockMovement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 1000,
    include: { item: { select: { name: true, variant: true, sku: true, unit: true } } },
  })
}

/* -------------------------------------------------------------- dashboard */

export async function storeDashboard(ctx: AppContext) {
  ctx.require('store.view')
  const today = schoolToday()
  const monthStart = `${today.slice(0, 8)}01`
  const trendStart = new Date(new Date(`${today}T00:00:00+05:30`).getTime() - 13 * 86_400_000)

  const [items, todayAgg, monthAgg, todayModes, recent, monthLines, trendRows] = await Promise.all([
    ctx.db.storeItem.findMany({
      where: { isActive: true },
      select: { id: true, name: true, variant: true, sku: true, category: true, quantity: true, reorderLevel: true, avgCostMinor: true, sellingPriceMinor: true },
    }),
    ctx.db.storeSale.aggregate({
      where: { status: 'COMPLETED', soldAt: dayBounds(today, today) },
      _sum: { totalMinor: true },
      _count: true,
    }),
    ctx.db.storeSale.aggregate({
      where: { status: 'COMPLETED', soldAt: dayBounds(monthStart, today) },
      _sum: { totalMinor: true, costMinor: true, taxMinor: true },
      _count: true,
    }),
    ctx.db.storeSale.groupBy({
      by: ['paymentMode'],
      where: { status: 'COMPLETED', soldAt: dayBounds(today, today) },
      _sum: { totalMinor: true },
    }),
    ctx.db.storeSale.findMany({
      orderBy: { soldAt: 'desc' },
      take: 8,
      select: { id: true, number: true, soldAt: true, customerName: true, totalMinor: true, paymentMode: true, status: true },
    }),
    ctx.db.storeSaleLine.findMany({
      where: { sale: { status: 'COMPLETED', soldAt: dayBounds(monthStart, today) } },
      select: { itemId: true, description: true, quantity: true, amountMinor: true, item: { select: { category: true } } },
    }),
    ctx.db.$queryRawUnsafe<Array<{ day: string; total: bigint | number }>>(
      `SELECT to_char(("soldAt" AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day, SUM("totalMinor") AS total
         FROM "StoreSale"
        WHERE "tenantId" = $1 AND status = 'COMPLETED' AND "soldAt" >= $2
        GROUP BY 1`,
      ctx.tenant.id,
      trendStart,
    ),
  ])

  const stockValueMinor = items.reduce((s, i) => s + Math.max(i.quantity, 0) * i.avgCostMinor, 0)
  const retailValueMinor = items.reduce((s, i) => s + Math.max(i.quantity, 0) * i.sellingPriceMinor, 0)
  const out = items.filter((i) => i.quantity <= 0)
  const low = items.filter((i) => i.quantity > 0 && i.quantity <= i.reorderLevel)

  const byItem = new Map<string, { description: string; quantity: number; amountMinor: number }>()
  const byCategory = new Map<string, number>()
  for (const l of monthLines) {
    const row = byItem.get(l.itemId) ?? { description: l.description, quantity: 0, amountMinor: 0 }
    row.quantity += l.quantity
    row.amountMinor += l.amountMinor
    byItem.set(l.itemId, row)
    byCategory.set(l.item.category, (byCategory.get(l.item.category) ?? 0) + l.amountMinor)
  }

  const trendMap = new Map(trendRows.map((r) => [r.day, Number(r.total)]))
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = schoolToday(new Date(trendStart.getTime() + i * 86_400_000 + 12 * 3_600_000))
    return { day, totalMinor: trendMap.get(day) ?? 0 }
  })

  const monthSales = monthAgg._sum.totalMinor ?? 0
  const monthTax = monthAgg._sum.taxMinor ?? 0
  const monthCost = monthAgg._sum.costMinor ?? 0

  return {
    today: { count: todayAgg._count, totalMinor: todayAgg._sum.totalMinor ?? 0 },
    month: {
      count: monthAgg._count,
      totalMinor: monthSales,
      grossProfitMinor: monthSales - monthTax - monthCost,
    },
    todayModes: todayModes.map((m) => ({ mode: m.paymentMode, totalMinor: m._sum.totalMinor ?? 0 })),
    stock: {
      itemCount: items.length,
      units: items.reduce((s, i) => s + Math.max(i.quantity, 0), 0),
      valueMinor: stockValueMinor,
      retailValueMinor,
      outCount: out.length,
      lowCount: low.length,
    },
    alerts: [...out, ...low]
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 12)
      .map((i) => ({ id: i.id, label: itemLabel(i), sku: i.sku, quantity: i.quantity, reorderLevel: i.reorderLevel })),
    topItems: [...byItem.values()].sort((a, b) => b.amountMinor - a.amountMinor).slice(0, 6),
    categories: STORE_CATEGORIES.map((c) => ({
      value: c.value,
      label: c.label,
      colour: c.colour,
      salesMinor: byCategory.get(c.value) ?? 0,
      items: items.filter((i) => i.category === c.value).length,
    })).filter((c) => c.items > 0 || c.salesMinor > 0),
    trend,
    recent,
  }
}

/* ---------------------------------------------------------------- exports */

export async function exportStoreSales(ctx: AppContext, filter: SaleFilter) {
  ctx.require('store.view')
  return ctx.db.storeSale.findMany({
    where: saleWhere(filter),
    orderBy: { soldAt: 'desc' },
    take: 20000,
    include: { student: { select: { admissionNo: true } } },
  })
}
