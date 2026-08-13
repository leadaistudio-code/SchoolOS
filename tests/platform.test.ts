import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PERMISSIONS } from '../src/lib/rbac/permissions'
import { ROLE } from '../src/lib/rbac/roles'
import { provisionSchool } from '../src/server/modules/platform/provision'
import { suspendTenant, reactivateTenant } from '../src/server/modules/platform/tenants'
import { createPlan } from '../src/server/modules/platform/plans'
import {
  generateInvoice,
  markInvoicePaid,
  runOverdueScan,
} from '../src/server/modules/platform/billing'
import {
  createTenantTicket,
  replyPlatformTicket,
} from '../src/server/modules/platform/support'
import { tenantDb } from '../src/server/db/tenant-client'
import { getEntitlements } from '../src/server/entitlements'

const prisma = new PrismaClient()

const slug = `phase8-test-${Date.now()}`
let tenantId = ''
let planId = ''
let subscriptionId = ''
let superAdminId = ''
let schoolAdminId = ''

function platformCtx(userId: string) {
  return {
    user: {
      userId,
      sessionId: 'test',
      tenantId: null,
      isSuperAdmin: true,
      firstName: 'Test',
      lastName: 'Admin',
      email: 'super@test.local',
      phone: null,
      avatarUrl: null,
      mustChangePassword: false,
      roleKeys: [ROLE.SUPER_ADMIN],
      permissions: new Set(PERMISSIONS.map((p) => p.key)),
      impersonatedById: null,
    },
    db: prisma,
  }
}

function schoolCtx(tenant: string, userId: string) {
  const perms = new Set(PERMISSIONS.filter((p) => !p.key.startsWith('platform.')).map((p) => p.key))
  return {
    user: {
      userId,
      sessionId: 'test',
      tenantId: tenant,
      isSuperAdmin: false,
      firstName: 'School',
      lastName: 'Admin',
      email: 'admin@test.local',
      phone: null,
      avatarUrl: null,
      mustChangePassword: false,
      roleKeys: [ROLE.SCHOOL_ADMIN],
      permissions: perms,
      impersonatedById: null,
    },
    tenant: {
      id: tenant,
      slug,
      name: 'Phase 8 Test School',
      status: 'ACTIVE',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      locale: 'en-IN',
      school: null,
    },
    db: tenantDb(tenant),
    can: (p: string) => perms.has(p),
    canAny: (...ps: string[]) => ps.some((p) => perms.has(p)),
    require: (p: string) => {
      if (!perms.has(p)) throw new Error(p)
    },
  }
}

describe('platform SaaS ops', () => {
  beforeAll(async () => {
    const plan = await prisma.plan.findFirst({ where: { code: 'STARTER' } })
    if (!plan) throw new Error('Seed STARTER plan required')
    planId = plan.id

    const superAdmin = await prisma.user.findFirst({
      where: { isSuperAdmin: true, status: 'ACTIVE' },
    })
    if (!superAdmin) throw new Error('Seed super admin required')
    superAdminId = superAdmin.id

    const result = await provisionSchool(prisma, {
      slug,
      schoolName: 'Phase 8 Test School',
      adminEmail: `${slug}@test.local`,
      adminPassword: 'Password@12345',
      planId,
      trial: true,
    })
    tenantId = result.tenant.id
    schoolAdminId = result.user.id

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId } })
    subscriptionId = sub.id
  })

  afterAll(async () => {
    if (tenantId) {
      await prisma.supportTicketMessage.deleteMany({ where: { ticket: { tenantId } } })
      await prisma.supportTicket.deleteMany({ where: { tenantId } })
      await prisma.subscriptionInvoice.deleteMany({ where: { subscriptionId } })
      await prisma.usageMetric.deleteMany({ where: { tenantId } })
      await prisma.tenantEntitlementOverride.deleteMany({ where: { tenantId } })
      await prisma.userRole.deleteMany({ where: { user: { tenantId } } })
      await prisma.user.deleteMany({ where: { tenantId } })
      await prisma.academicSession.deleteMany({ where: { tenantId } })
      await prisma.tenantDomain.deleteMany({ where: { tenantId } })
      await prisma.school.deleteMany({ where: { tenantId } })
      await prisma.subscription.deleteMany({ where: { tenantId } })
      await prisma.tenant.delete({ where: { id: tenantId } })
    }
    await prisma.$disconnect()
  })

  it('provision creates tenant, school, subscription and admin', async () => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { school: true, subscription: true },
    })
    expect(tenant?.slug).toBe(slug)
    expect(tenant?.school).toBeTruthy()
    expect(tenant?.subscription?.planId).toBe(planId)
    const admin = await prisma.user.findUnique({ where: { id: schoolAdminId } })
    expect(admin?.email).toBe(`${slug}@test.local`)
  })

  it('rejects duplicate slug on provision', async () => {
    await expect(
      provisionSchool(prisma, {
        slug,
        schoolName: 'Duplicate',
        adminEmail: 'dup@test.local',
        adminPassword: 'Password@12345',
        planId,
      }),
    ).rejects.toThrow(/already taken/)
  })

  it('suspend marks tenant suspended', async () => {
    const ctx = platformCtx(superAdminId)
    await suspendTenant(ctx, tenantId)
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })
    expect(tenant.status).toBe('SUSPENDED')
    await reactivateTenant(ctx, tenantId)
    const active = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })
    expect(active.status).toBe('ACTIVE')
  })

  it('plan change updates entitlements resolution', async () => {
    const pro = await prisma.plan.findFirst({ where: { code: 'PRO' } })
    expect(pro).toBeTruthy()
    await prisma.subscription.update({
      where: { tenantId },
      data: { planId: pro!.id },
    })
    const map = await getEntitlements(tenantId)
    expect(map['limit.students']?.limit).toBeTruthy()
    await prisma.subscription.update({ where: { tenantId }, data: { planId } })
  })

  it('invoice generate, pay, and overdue scan', async () => {
    const ctx = platformCtx(superAdminId)
    const invoice = await generateInvoice(ctx, { tenantId, dueInDays: 1 })
    expect(invoice.status).toBe('DUE')
    expect(invoice.number).toMatch(/^INV-/)

    await markInvoicePaid(ctx, invoice.id)
    const paid = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(paid.status).toBe('PAID')

    const overdueInv = await generateInvoice(ctx, { tenantId, dueInDays: -1 })
    await prisma.subscriptionInvoice.update({
      where: { id: overdueInv.id },
      data: { dueAt: new Date(Date.now() - 86_400_000) },
    })
    const scan = await runOverdueScan(ctx)
    expect(scan.updated).toBeGreaterThanOrEqual(1)
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })
    expect(tenant.status).toBe('PAST_DUE')
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } })
    await prisma.subscription.update({ where: { tenantId }, data: { status: 'ACTIVE' } })
  })

  it('support ticket create (tenant) and reply (platform)', async () => {
    const sctx = schoolCtx(tenantId, schoolAdminId) as never
    const ticket = await createTenantTicket(sctx, {
      subject: 'Test ticket',
      body: 'Need help with billing',
      priority: 'NORMAL',
    })
    expect(ticket.tenantId).toBe(tenantId)

    const pctx = platformCtx(superAdminId)
    const msg = await replyPlatformTicket(pctx, ticket.id, { body: 'We are looking into it.' })
    expect(msg.authorKind).toBe('PLATFORM')
  })

  it('new plan is created with default entitlements', async () => {
    const ctx = platformCtx(superAdminId)
    const code = `TEST_${Date.now()}`
    const plan = await createPlan(ctx, {
      code,
      name: 'Test plan',
      tier: 'STARTER',
      priceMinor: 100_00,
      currency: 'INR',
      cycle: 'YEARLY',
      trialDays: 7,
      isPublic: false,
      sortOrder: 99,
    })
    expect(plan.entitlements.length).toBeGreaterThan(0)
    await ctx.db.planEntitlement.deleteMany({ where: { planId: plan.id } })
    await ctx.db.plan.delete({ where: { id: plan.id } })
  })

  it('SUPER_ADMIN holds all platform permissions', async () => {
    const superRole = await prisma.role.findFirstOrThrow({
      where: { tenantId: null, key: ROLE.SUPER_ADMIN },
      include: { permissions: { include: { permission: true } } },
    })
    const keys = superRole.permissions.map((p) => p.permission.key)
    for (const p of PERMISSIONS.filter((x) => x.key.startsWith('platform.'))) {
      expect(keys).toContain(p.key)
    }
  })
})

describe('tenant slug normalisation', () => {
  it('lowercases, hyphenates spaces and strips invalid characters', async () => {
    const { normalizeTenantSlug } = await import('../src/server/modules/platform/schema')
    expect(normalizeTenantSlug("St John's High")).toBe('st-johns-high')
    expect(normalizeTenantSlug('  My_School  ')).toBe('my-school')
    expect(normalizeTenantSlug('Demo@2026')).toBe('demo2026')
  })
})

describe('schema drift — SupportTicket', () => {
  it('SupportTicketMessage model exists in client', () => {
    expect(prisma.supportTicketMessage).toBeDefined()
  })
})
