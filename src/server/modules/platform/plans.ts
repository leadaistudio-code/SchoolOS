import type { PlatformContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, conflict, notFound } from '@/server/api/response'
import type { planEntitlementSchema, planUpsertSchema } from './schema'
import type { z } from 'zod'
import { FEATURE } from '@/lib/features'

export async function listPlans(ctx: PlatformContext) {
  return ctx.db.plan.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      entitlements: true,
      _count: { select: { subscriptions: true } },
    },
  })
}

export async function getPlan(ctx: PlatformContext, id: string) {
  const plan = await ctx.db.plan.findUnique({
    where: { id },
    include: { entitlements: true, _count: { select: { subscriptions: true } } },
  })
  if (!plan) throw notFound('Plan')
  return plan
}

export async function createPlan(
  ctx: PlatformContext,
  input: z.infer<typeof planUpsertSchema>,
) {
  const existing = await ctx.db.plan.findUnique({ where: { code: input.code } })
  if (existing) throw conflict(`Plan code ${input.code} already exists`)

  const plan = await ctx.db.plan.create({ data: input })
  await setPlanEntitlements(ctx, plan.id, [])

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    action: 'plan.create',
    module: 'platform',
    entityType: 'Plan',
    entityId: plan.id,
    summary: `Created plan ${plan.name}`,
    after: input,
  })

  return getPlan(ctx, plan.id)
}

export async function updatePlan(
  ctx: PlatformContext,
  id: string,
  input: Partial<z.infer<typeof planUpsertSchema>>,
) {
  const before = await ctx.db.plan.findUnique({ where: { id } })
  if (!before) throw notFound('Plan')

  const plan = await ctx.db.plan.update({ where: { id }, data: input })

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    action: 'plan.update',
    module: 'platform',
    entityType: 'Plan',
    entityId: id,
    summary: `Updated plan ${plan.name}`,
    before,
    after: input,
  })

  return plan
}

export async function setPlanEntitlements(
  ctx: PlatformContext,
  planId: string,
  entitlements: z.infer<typeof planEntitlementSchema>[],
) {
  const plan = await ctx.db.plan.findUnique({ where: { id: planId } })
  if (!plan) throw notFound('Plan')

  const allKeys = Object.values(FEATURE)
  const byKey = new Map(entitlements.map((e) => [e.featureKey, e]))

  await ctx.db.$transaction([
    ctx.db.planEntitlement.deleteMany({ where: { planId } }),
    ctx.db.planEntitlement.createMany({
      data: allKeys.map((featureKey) => {
        const e = byKey.get(featureKey)
        return {
          planId,
          featureKey,
          enabled: e?.enabled ?? featureKey.startsWith('limit.'),
          limitValue: e?.limitValue ?? null,
        }
      }),
    }),
  ])

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    action: 'plan.entitlements',
    module: 'platform',
    entityType: 'Plan',
    entityId: planId,
    summary: `Updated entitlements for ${plan.name}`,
  })

  const tenants = await ctx.db.subscription.findMany({
    where: { planId },
    select: { tenantId: true },
  })
  const { invalidateEntitlementsCache } = await import('@/server/entitlements')
  await Promise.all(tenants.map((t) => invalidateEntitlementsCache(t.tenantId)))

  return getPlan(ctx, planId)
}

export async function deletePlan(ctx: PlatformContext, id: string) {
  const plan = await ctx.db.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  })
  if (!plan) throw notFound('Plan')
  if (plan._count.subscriptions > 0) {
    throw badRequest('Cannot delete a plan with active subscriptions')
  }

  await ctx.db.plan.delete({ where: { id } })

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    action: 'plan.delete',
    module: 'platform',
    entityType: 'Plan',
    entityId: id,
    summary: `Deleted plan ${plan.name}`,
  })
}
