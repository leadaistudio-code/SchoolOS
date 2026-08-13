import type { PlatformContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { paginationMeta } from '@/server/api/response'
import type { listTenantsSchema, provisionTenantSchema, updateTenantSchema, entitlementOverrideSchema } from './schema'
import type { z } from 'zod'
import { provisionSchool } from './provision'
import { snapshotUsage, usageVsLimits } from './usage'

export async function listTenants(
  ctx: PlatformContext,
  query: z.infer<typeof listTenantsSchema>,
) {
  const where = {
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.planId ? { subscription: { planId: query.planId } } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { slug: { contains: query.q, mode: 'insensitive' as const } },
            { school: { name: { contains: query.q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    ctx.db.tenant.count({ where }),
    ctx.db.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        school: { select: { name: true, city: true, email: true } },
        subscription: { include: { plan: true } },
        _count: { select: { domains: true, supportTickets: true } },
      },
    }),
  ])

  return { rows, meta: paginationMeta(query.page, query.pageSize, total) }
}

export async function getTenant(ctx: PlatformContext, id: string) {
  const tenant = await ctx.db.tenant.findUnique({
    where: { id },
    include: {
      school: { include: { branding: true } },
      subscription: { include: { plan: { include: { entitlements: true } }, invoices: { orderBy: { createdAt: 'desc' }, take: 10 } } },
      domains: true,
      overrides: true,
      _count: { select: { supportTickets: true } },
    },
  })
  if (!tenant) throw notFound('Tenant')

  await snapshotUsage(ctx, tenant.id)
  const usage = await usageVsLimits(tenant.id)

  const users = await ctx.db.user.findMany({
    where: { tenantId: id, deletedAt: null, status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      roles: { include: { role: { select: { key: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  const usersWithRoles = users.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    roles: u.roles.map((r) => r.role),
  }))

  return { tenant, usage, users: usersWithRoles }
}

export async function provisionTenant(
  ctx: PlatformContext,
  input: z.infer<typeof provisionTenantSchema>,
) {
  const result = await provisionSchool(ctx.db, {
    slug: input.slug,
    schoolName: input.schoolName,
    adminEmail: input.adminEmail,
    adminPassword: input.adminPassword,
    adminName: input.adminName,
    planId: input.planId,
    trial: input.trial,
    host: input.host,
  })

  await audit({
    tenantId: result.tenant.id,
    actorId: ctx.user.userId,
    action: 'tenant.provision',
    module: 'platform',
    entityType: 'Tenant',
    entityId: result.tenant.id,
    summary: `Provisioned ${input.schoolName} (${input.slug})`,
    after: { slug: input.slug, planId: input.planId },
  })

  return result
}

export async function updateTenant(
  ctx: PlatformContext,
  id: string,
  input: z.infer<typeof updateTenantSchema>,
) {
  const before = await ctx.db.tenant.findUnique({ where: { id }, include: { subscription: true } })
  if (!before) throw notFound('Tenant')

  if (input.planId && before.subscription) {
    const plan = await ctx.db.plan.findUnique({ where: { id: input.planId } })
    if (!plan) throw badRequest('Plan not found')
    await ctx.db.subscription.update({
      where: { tenantId: id },
      data: { planId: input.planId },
    })
    await audit({
      tenantId: id,
      actorId: ctx.user.userId,
      action: 'tenant.plan.change',
      module: 'platform',
      entityType: 'Subscription',
      entityId: before.subscription.id,
      summary: `Changed plan to ${plan.name}`,
      before: { planId: before.subscription.planId },
      after: { planId: input.planId },
    })
  }

  const tenant = await ctx.db.tenant.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
    },
    include: { subscription: { include: { plan: true } }, school: true },
  })

  return tenant
}

export async function suspendTenant(ctx: PlatformContext, id: string) {
  return setTenantStatus(ctx, id, 'SUSPENDED', 'tenant.suspend')
}

export async function reactivateTenant(ctx: PlatformContext, id: string) {
  return setTenantStatus(ctx, id, 'ACTIVE', 'tenant.reactivate')
}

export async function archiveTenant(ctx: PlatformContext, id: string) {
  return setTenantStatus(ctx, id, 'ARCHIVED', 'tenant.archive')
}

async function setTenantStatus(
  ctx: PlatformContext,
  id: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED',
  action: string,
) {
  const before = await ctx.db.tenant.findUnique({ where: { id } })
  if (!before) throw notFound('Tenant')
  if (before.status === status) throw conflict(`Tenant is already ${status.toLowerCase()}`)

  const tenant = await ctx.db.tenant.update({
    where: { id },
    data: {
      status,
      ...(status === 'ARCHIVED' ? { archivedAt: new Date() } : {}),
    },
  })

  await ctx.db.subscription.updateMany({
    where: { tenantId: id },
    data: { status: status === 'ARCHIVED' ? 'ARCHIVED' : status },
  })

  await audit({
    tenantId: id,
    actorId: ctx.user.userId,
    action,
    module: 'platform',
    entityType: 'Tenant',
    entityId: id,
    summary: `${before.name} → ${status}`,
    before: { status: before.status },
    after: { status },
  })

  return tenant
}

export async function setEntitlementOverride(
  ctx: PlatformContext,
  tenantId: string,
  input: z.infer<typeof entitlementOverrideSchema>,
) {
  const tenant = await ctx.db.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw notFound('Tenant')

  const row = await ctx.db.tenantEntitlementOverride.upsert({
    where: { tenantId_featureKey: { tenantId, featureKey: input.featureKey } },
    create: {
      tenantId,
      featureKey: input.featureKey,
      enabled: input.enabled ?? null,
      limitValue: input.limitValue ?? null,
      note: input.note ?? null,
    },
    update: {
      enabled: input.enabled ?? null,
      limitValue: input.limitValue ?? null,
      note: input.note ?? null,
    },
  })

  await audit({
    tenantId,
    actorId: ctx.user.userId,
    action: 'entitlement.override',
    module: 'platform',
    entityType: 'TenantEntitlementOverride',
    entityId: row.id,
    summary: `Override ${input.featureKey}`,
    after: input,
  })

  return row
}

export async function removeEntitlementOverride(
  ctx: PlatformContext,
  tenantId: string,
  featureKey: string,
) {
  await ctx.db.tenantEntitlementOverride.deleteMany({ where: { tenantId, featureKey } })
  await audit({
    tenantId,
    actorId: ctx.user.userId,
    action: 'entitlement.override.remove',
    module: 'platform',
    entityType: 'TenantEntitlementOverride',
    summary: `Removed override for ${featureKey}`,
  })
}
