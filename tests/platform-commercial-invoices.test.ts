import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { addMonths, startOfMonth, subMonths } from 'date-fns'
import { PERMISSIONS } from '../src/lib/rbac/permissions'
import { ROLE } from '../src/lib/rbac/roles'
import { provisionSchool } from '../src/server/modules/platform/provision'
import {
  createCommercialInvoice,
  ensureSampleTemplates,
  markCommercialInvoicePaid,
  runMonthlyCommercialInvoices,
  voidCommercialInvoice,
} from '../src/server/modules/platform/commercial-invoices'

const prisma = new PrismaClient()
const slug = `comm-inv-${Date.now()}`
let tenantId = ''
let templateId = ''
let superAdminId = ''
let planId = ''

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
      displayName: null,
      mustChangePassword: false,
      roleKeys: [ROLE.SUPER_ADMIN],
      permissions: new Set(PERMISSIONS.map((p) => p.key)),
      impersonatedById: null,
    },
    db: prisma,
  }
}

describe('platform commercial invoices', () => {
  beforeAll(async () => {
    const plan = await prisma.plan.findFirst({ where: { code: 'STARTER' } })
    if (!plan) throw new Error('Seed STARTER plan required')
    planId = plan.id
    const superAdmin = await prisma.user.findFirst({ where: { isSuperAdmin: true, status: 'ACTIVE' } })
    if (!superAdmin) throw new Error('Seed super admin required')
    superAdminId = superAdmin.id

    await ensureSampleTemplates(prisma)
    const template = await prisma.platformInvoiceTemplate.findUniqueOrThrow({ where: { code: 'classic_white' } })
    templateId = template.id

    const result = await provisionSchool(prisma, {
      slug,
      schoolName: 'Commercial Invoice Test School',
      adminEmail: `${slug}@test.local`,
      adminPassword: 'Password@12345',
      planId,
      trial: false,
    })
    tenantId = result.tenant.id
    await prisma.subscription.update({
      where: { tenantId },
      data: { cycle: 'MONTHLY', status: 'ACTIVE' },
    })
  })

  afterAll(async () => {
    if (tenantId) {
      await prisma.platformInvoiceLine.deleteMany({ where: { invoice: { tenantId } } })
      await prisma.platformInvoice.deleteMany({ where: { tenantId } })
      await prisma.subscriptionInvoice.deleteMany({ where: { subscription: { tenantId } } })
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

  it('creates a school-tagged invoice with line items and numbering', async () => {
    const ctx = platformCtx(superAdminId)
    const invoice = await createCommercialInvoice(ctx, {
      tenantId,
      templateId,
      status: 'DUE',
      dueInDays: 14,
      advanceMinor: 5100_00,
      autoMonthly: true,
      lines: [
        {
          title: 'One-time onboarding fee',
          description: 'Setup and training',
          qty: 1,
          amountMinor: 15000_00,
        },
      ],
    })
    expect(invoice.number).toMatch(/^MCV\/INV\//)
    expect(invoice.subtotalMinor).toBe(15000_00)
    expect(invoice.balanceMinor).toBe(9900_00)
    expect(invoice.autoMonthly).toBe(true)
    expect(invoice.lines).toHaveLength(1)
  })

  it('rejects autoMonthly when subscription is not MONTHLY', async () => {
    const ctx = platformCtx(superAdminId)
    await prisma.subscription.update({ where: { tenantId }, data: { cycle: 'YEARLY' } })
    await expect(
      createCommercialInvoice(ctx, {
        tenantId,
        templateId,
        status: 'DUE',
        dueInDays: 7,
        advanceMinor: 0,
        autoMonthly: true,
        lines: [{ title: 'Pro Pack', qty: 1, amountMinor: 36000_00 }],
      }),
    ).rejects.toThrow(/MONTHLY/)
    await prisma.subscription.update({ where: { tenantId }, data: { cycle: 'MONTHLY' } })
  })

  it('monthly cron clones schedule idempotently for current month', async () => {
    const schedule = await prisma.platformInvoice.findFirstOrThrow({
      where: { tenantId, autoMonthly: true },
      orderBy: { createdAt: 'asc' },
    })
    // Move schedule to previous month so cron will clone for "now"
    const prev = subMonths(startOfMonth(new Date()), 1)
    await prisma.platformInvoice.update({
      where: { id: schedule.id },
      data: { issueDate: prev, periodStart: prev, periodEnd: addMonths(prev, 1) },
    })
    // Clear any current-month auto invoices
    await prisma.platformInvoiceLine.deleteMany({
      where: {
        invoice: {
          tenantId,
          autoMonthly: true,
          issueDate: { gte: startOfMonth(new Date()) },
          id: { not: schedule.id },
        },
      },
    })
    await prisma.platformInvoice.deleteMany({
      where: {
        tenantId,
        autoMonthly: true,
        issueDate: { gte: startOfMonth(new Date()) },
        id: { not: schedule.id },
      },
    })

    const first = await runMonthlyCommercialInvoices(new Date())
    expect(first.created).toBeGreaterThanOrEqual(1)
    const second = await runMonthlyCommercialInvoices(new Date())
    expect(second.created).toBe(0)

    const thisMonth = await prisma.platformInvoice.count({
      where: {
        tenantId,
        autoMonthly: true,
        status: { not: 'VOID' },
        issueDate: { gte: startOfMonth(new Date()) },
      },
    })
    expect(thisMonth).toBe(1)
  })

  it('pay and void work', async () => {
    const ctx = platformCtx(superAdminId)
    const invoice = await createCommercialInvoice(ctx, {
      tenantId,
      templateId,
      status: 'DUE',
      dueInDays: 7,
      advanceMinor: 0,
      autoMonthly: false,
      lines: [{ title: 'Support hours', qty: 2, amountMinor: 1000_00 }],
    })
    await markCommercialInvoicePaid(ctx, invoice.id, 'pay_test')
    const paid = await prisma.platformInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(paid.status).toBe('PAID')
    expect(paid.balanceMinor).toBe(0)

    const other = await createCommercialInvoice(ctx, {
      tenantId,
      templateId,
      status: 'DUE',
      dueInDays: 7,
      advanceMinor: 0,
      autoMonthly: false,
      lines: [{ title: 'Misc', qty: 1, amountMinor: 500_00 }],
    })
    await voidCommercialInvoice(ctx, other.id)
    const voided = await prisma.platformInvoice.findUniqueOrThrow({ where: { id: other.id } })
    expect(voided.status).toBe('VOID')
  })
})
