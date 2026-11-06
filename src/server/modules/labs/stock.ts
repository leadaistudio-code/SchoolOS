import type { LabMovementType, Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { schoolToday } from '@/lib/periods'
import { shortfall } from '@/lib/labs/readiness'
import { actorLabel, assertLabs, auditLab, dateOnly } from './access'
import { getLab } from './service'
import { labItemSchema, movementSchema, newLabItemSchema } from './schema'

type LockedItem = { id: string; labId: string; name: string; unit: string; quantity: number; isActive: boolean }

const round = (n: number) => Math.round(n * 1000) / 1000

/** Row-locks lab items so two people booking stock at once cannot both spend the same units. */
export async function lockLabItems(tx: Prisma.TransactionClient, tenantId: string, ids: string[]) {
  const unique = [...new Set(ids)].sort()
  if (unique.length === 0) return new Map<string, LockedItem>()
  const rows = await tx.$queryRawUnsafe<LockedItem[]>(
    `SELECT id, "labId", name, unit, quantity, "isActive"
       FROM "LabItem"
      WHERE "tenantId" = $1 AND id = ANY($2::text[]) AND "deletedAt" IS NULL
      ORDER BY id
        FOR UPDATE`,
    tenantId,
    unique,
  )
  const map = new Map(rows.map((r) => [r.id, r]))
  for (const id of unique) if (!map.has(id)) throw notFound('Lab item')
  return map
}

/** Applies a signed change, writes the ledger row and returns the new balance. */
export async function postMovement(
  tx: Prisma.TransactionClient,
  ctx: AppContext,
  item: LockedItem,
  data: {
    type: LabMovementType
    delta: number
    unitCostMinor?: number
    sessionId?: string | null
    studentId?: string | null
    chargeMinor?: number | null
    vendorName?: string | null
    invoiceNo?: string | null
    reason?: string | null
    /** Consumption may not take stock below zero; other removals are checked too. */
    allowNegative?: boolean
  },
) {
  const balance = round(item.quantity + data.delta)
  if (balance < 0 && !data.allowNegative) {
    throw conflict(`Only ${round(item.quantity)} ${item.unit} of ${item.name} in stock`)
  }
  await tx.labItem.update({ where: { id: item.id }, data: { quantity: balance } })
  item.quantity = balance
  return tx.labStockMovement.create({
    data: {
      tenantId: ctx.tenant.id,
      labId: item.labId,
      itemId: item.id,
      type: data.type,
      quantity: round(data.delta),
      balanceAfter: balance,
      unitCostMinor: data.unitCostMinor ?? 0,
      sessionId: data.sessionId ?? null,
      studentId: data.studentId ?? null,
      chargeMinor: data.chargeMinor ?? null,
      vendorName: data.vendorName ?? null,
      invoiceNo: data.invoiceNo ?? null,
      reason: data.reason ?? null,
      actorId: ctx.user.userId,
      actorLabel: actorLabel(ctx),
    },
  })
}

function itemData(input: ReturnType<typeof labItemSchema.parse>) {
  return {
    name: input.name,
    category: input.category,
    kind: input.kind,
    unit: input.unit,
    requiredQty: input.requiredQty,
    reorderLevel: input.reorderLevel,
    storageLocation: input.storageLocation ?? null,
    hazards: input.hazards,
    expiresOn: input.expiresOn ? dateOnly(input.expiresOn) : null,
    unitCostMinor: input.unitCostMinor,
    notes: input.notes ?? null,
  }
}

export async function addLabItem(ctx: AppContext, labId: string, raw: unknown) {
  ctx.require('labs.stock')
  await getLab(ctx, labId)
  const input = newLabItemSchema.parse(raw)
  const item = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    const item = await tx.labItem.create({
      data: { tenantId: ctx.tenant.id, labId, ...itemData(input), quantity: 0 },
    })
    if (input.openingQty > 0) {
      const locked = (await lockLabItems(tx, ctx.tenant.id, [item.id])).get(item.id)!
      await postMovement(tx, ctx, locked, {
        type: 'OPENING',
        delta: input.openingQty,
        unitCostMinor: input.unitCostMinor,
        reason: 'Opening stock',
      })
    }
    return item
  })
  await auditLab(ctx, 'labs.item.create', 'LabItem', item.id, `Added ${item.name} to the lab register`)
  return item
}

export async function updateLabItem(ctx: AppContext, itemId: string, raw: unknown) {
  ctx.require('labs.stock')
  await assertLabs(ctx)
  const existing = await ctx.db.labItem.findFirst({ where: { id: itemId, deletedAt: null } })
  if (!existing) throw notFound('Lab item')
  const input = labItemSchema.parse(raw)
  const item = await ctx.db.labItem.update({ where: { id: itemId }, data: itemData(input) })
  await auditLab(ctx, 'labs.item.update', 'LabItem', item.id, `Edited ${item.name}`)
  return item
}

export async function setItemMsds(ctx: AppContext, itemId: string, storageKey: string | null) {
  ctx.require('labs.stock')
  await assertLabs(ctx)
  const item = await ctx.db.labItem.findFirst({ where: { id: itemId, deletedAt: null } })
  if (!item) throw notFound('Lab item')
  await ctx.db.labItem.update({ where: { id: itemId }, data: { msdsKey: storageKey } })
  await auditLab(ctx, 'labs.item.msds', 'LabItem', itemId, `${storageKey ? 'Attached' : 'Removed'} the safety data sheet for ${item.name}`)
}

/** Opening stock for many template rows at once, from the setup wizard's count sheet. */
export async function setOpeningCounts(ctx: AppContext, labId: string, counts: { itemId: string; qty: number }[]) {
  ctx.require('labs.stock')
  await getLab(ctx, labId)
  const wanted = counts.filter((c) => Number.isFinite(c.qty) && c.qty >= 0)
  if (wanted.length === 0) return 0
  let changed = 0
  await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    const items = await lockLabItems(tx, ctx.tenant.id, wanted.map((c) => c.itemId))
    for (const c of wanted) {
      const item = items.get(c.itemId)!
      if (item.labId !== labId) throw badRequest('Item belongs to another lab')
      const delta = round(c.qty - item.quantity)
      if (delta === 0) continue
      const hasHistory = await tx.labStockMovement.count({ where: { itemId: item.id } })
      await postMovement(tx, ctx, item, {
        type: hasHistory ? 'ADJUSTMENT' : 'OPENING',
        delta,
        reason: hasHistory ? 'Physical count' : 'Opening stock',
        allowNegative: false,
      })
      changed++
    }
  })
  await auditLab(ctx, 'labs.stock.count', 'Lab', labId, `Recorded stock count for ${changed} item(s)`)
  return changed
}

export async function recordMovement(ctx: AppContext, labId: string, raw: unknown) {
  ctx.require('labs.stock')
  await getLab(ctx, labId)
  const input = movementSchema.parse(raw)
  const movement = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    const item = (await lockLabItems(tx, ctx.tenant.id, [input.itemId])).get(input.itemId)!
    if (item.labId !== labId) throw badRequest('Item belongs to another lab')
    switch (input.type) {
      case 'PURCHASE': {
        const m = await postMovement(tx, ctx, item, {
          type: 'PURCHASE',
          delta: input.quantity,
          unitCostMinor: input.unitCostMinor,
          vendorName: input.vendorName,
          invoiceNo: input.invoiceNo,
          reason: input.reason,
        })
        // A fresh lot sets the expiry the register shows.
        await tx.labItem.update({
          where: { id: item.id },
          data: {
            ...(input.unitCostMinor > 0 ? { unitCostMinor: input.unitCostMinor } : {}),
            ...(input.expiresOn ? { expiresOn: dateOnly(input.expiresOn) } : {}),
          },
        })
        return m
      }
      case 'ADJUSTMENT': {
        const delta = round(input.countedQty - item.quantity)
        if (delta === 0) throw badRequest('The count matches the register; nothing to adjust')
        return postMovement(tx, ctx, item, { type: 'ADJUSTMENT', delta, reason: input.reason })
      }
      case 'BREAKAGE': {
        if (input.studentId) {
          const student = await tx.student.findFirst({ where: { id: input.studentId, tenantId: ctx.tenant.id }, select: { id: true } })
          if (!student) throw notFound('Student')
        }
        return postMovement(tx, ctx, item, {
          type: 'BREAKAGE',
          delta: -input.quantity,
          studentId: input.studentId,
          chargeMinor: input.chargeMinor,
          sessionId: input.sessionId,
          reason: input.reason,
        })
      }
      case 'DISPOSAL':
        return postMovement(tx, ctx, item, { type: 'DISPOSAL', delta: -input.quantity, reason: input.reason })
    }
  })
  await auditLab(ctx, `labs.stock.${input.type.toLowerCase()}`, 'LabStockMovement', movement.id, `${input.type.toLowerCase()} recorded`, input)
  return movement
}

export type RegisterFilter = 'all' | 'shortfall' | 'low' | 'expiry' | 'chemicals' | 'consumables' | 'non-consumables'

export async function registerRows(ctx: AppContext, labId: string, filter: RegisterFilter = 'all') {
  ctx.require('labs.view')
  await getLab(ctx, labId)
  const today = dateOnly(schoolToday())
  const soon = new Date(today.getTime() + 30 * 86_400_000)
  const items = await ctx.db.labItem.findMany({
    where: { labId, deletedAt: null },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
  const rows = items.map((item) => ({
    ...item,
    shortfall: shortfall(item.requiredQty, item.quantity),
    low: item.reorderLevel > 0 && item.quantity <= item.reorderLevel,
    expired: !!item.expiresOn && item.expiresOn < today,
    expiring: !!item.expiresOn && item.expiresOn >= today && item.expiresOn <= soon,
  }))
  switch (filter) {
    case 'shortfall':
      return rows.filter((r) => r.shortfall > 0)
    case 'low':
      return rows.filter((r) => r.low)
    case 'expiry':
      return rows.filter((r) => r.expired || r.expiring)
    case 'chemicals':
      return rows.filter((r) => r.category === 'CHEMICAL' || r.hazards.length > 0)
    case 'consumables':
      return rows.filter((r) => r.kind === 'CONSUMABLE')
    case 'non-consumables':
      return rows.filter((r) => r.kind === 'NON_CONSUMABLE')
    default:
      return rows
  }
}

export async function listMovements(
  ctx: AppContext,
  labId: string,
  opts: { type?: LabMovementType; itemId?: string; take?: number } = {},
) {
  ctx.require('labs.view')
  await getLab(ctx, labId)
  return ctx.db.labStockMovement.findMany({
    where: { labId, ...(opts.type ? { type: opts.type } : {}), ...(opts.itemId ? { itemId: opts.itemId } : {}) },
    include: { item: { select: { name: true, unit: true } } },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 300,
  })
}

/** Student names for breakage rows, without granting students.view. */
export async function studentNames(ctx: AppContext, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map<string, string>()
  const rows = await ctx.db.student.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, admissionNo: true },
  })
  return new Map(rows.map((s) => [s.id, `${s.firstName} ${s.lastName} (${s.admissionNo})`]))
}
