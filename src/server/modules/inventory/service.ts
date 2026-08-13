import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import {
  assetActionSchema,
  assetCategorySchema,
  assetSchema,
  type AssetActionInput,
  type AssetInput,
} from './schema'

export async function listAssets(ctx: AppContext) {
  ctx.require('inventory.view')
  return ctx.db.asset.findMany({
    where: { deletedAt: null },
    include: { category: { select: { name: true } } },
    orderBy: { name: 'asc' },
    take: 300,
  })
}

export async function listAssetCategories(ctx: AppContext) {
  ctx.require('inventory.view')
  return ctx.db.assetCategory.findMany({ orderBy: { name: 'asc' } })
}

export async function getAsset(ctx: AppContext, id: string) {
  ctx.require('inventory.view')
  const asset = await ctx.db.asset.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: true,
      history: { orderBy: { occurredAt: 'desc' }, take: 50 },
    },
  })
  if (!asset) throw notFound('Asset not found')
  return asset
}

export async function createAssetCategory(ctx: AppContext, name: string) {
  ctx.require('inventory.manage')
  const input = assetCategorySchema.parse({ name })
  return ctx.db.assetCategory.create({
    data: { tenantId: ctx.tenant.id, name: input.name },
  })
}

export async function createAsset(ctx: AppContext, raw: AssetInput) {
  ctx.require('inventory.manage')
  const input = assetSchema.parse(raw)
  const dup = await ctx.db.asset.findFirst({ where: { assetCode: input.assetCode } })
  if (dup) throw conflict(`Asset code ${input.assetCode} already exists`)

  const asset = await ctx.db.asset.create({
    data: {
      tenantId: ctx.tenant.id,
      name: input.name,
      assetCode: input.assetCode,
      categoryId: input.categoryId ?? null,
      description: input.description ?? null,
      quantity: input.quantity,
      location: input.location ?? null,
      vendorName: input.vendorName ?? null,
      purchasePriceMinor: input.purchasePriceMinor ?? null,
      condition: input.condition,
    },
  })

  await ctx.db.assetHistory.create({
    data: {
      tenantId: ctx.tenant.id,
      assetId: asset.id,
      action: 'MOVED',
      notes: 'Asset registered',
      actorId: ctx.user.userId,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'inventory.asset.create',
    module: 'inventory',
    entityType: 'Asset',
    entityId: asset.id,
    summary: `Registered ${asset.assetCode} — ${asset.name}`,
  })

  return asset
}

export async function recordAssetAction(ctx: AppContext, id: string, raw: AssetActionInput) {
  ctx.require('inventory.manage')
  const input = assetActionSchema.parse(raw)
  const asset = await ctx.db.asset.findFirst({ where: { id, deletedAt: null } })
  if (!asset) throw notFound('Asset not found')

  const updated = await ctx.db.$transaction(async (tx) => {
    const data: Record<string, unknown> = {}
    if (input.location !== undefined) data.location = input.location ?? null
    if (input.assignedToStaffId !== undefined) data.assignedToStaffId = input.assignedToStaffId ?? null
    if (input.action === 'DISPOSED') {
      data.condition = 'DISPOSED'
      data.disposedOn = new Date()
    }
    if (input.action === 'MAINTENANCE') data.condition = 'NEEDS_REPAIR'

    const next = await tx.asset.update({ where: { id }, data })
    await tx.assetHistory.create({
      data: {
        tenantId: ctx.tenant.id,
        assetId: id,
        action: input.action,
        notes: input.notes ?? null,
        actorId: ctx.user.userId,
      },
    })
    return next
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'inventory.asset.action',
    module: 'inventory',
    entityType: 'Asset',
    entityId: id,
    summary: `${asset.assetCode}: ${input.action}`,
  })

  return updated
}
