import { addDays, addMonths, addYears } from 'date-fns'
import type { PlatformContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, notFound } from '@/server/api/response'
import { paginationMeta } from '@/server/api/response'
import type { generateInvoiceSchema, listInvoicesSchema } from './schema'
import type { z } from 'zod'

function cycleEnd(start: Date, cycle: string) {
  if (cycle === 'MONTHLY') return addMonths(start, 1)
  if (cycle === 'QUARTERLY') return addMonths(start, 3)
  return addYears(start, 1)
}

async function nextInvoiceNumber(db: PlatformContext['db']) {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const last = await db.subscriptionInvoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  })
  const seq = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(seq).padStart(5, '0')}`
}

export async function listInvoices(
  ctx: PlatformContext,
  query: z.infer<typeof listInvoicesSchema>,
) {
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.tenantId ? { subscription: { tenantId: query.tenantId } } : {}),
  }

  const [total, rows] = await Promise.all([
    ctx.db.subscriptionInvoice.count({ where }),
    ctx.db.subscriptionInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        subscription: {
          include: { tenant: { select: { id: true, name: true, slug: true } }, plan: true },
        },
      },
    }),
  ])

  return { rows, meta: paginationMeta(query.page, query.pageSize, total) }
}

export async function generateInvoice(
  ctx: PlatformContext,
  input: z.infer<typeof generateInvoiceSchema>,
) {
  let subscriptionId = input.subscriptionId
  if (!subscriptionId && input.tenantId) {
    const sub = await ctx.db.subscription.findUnique({ where: { tenantId: input.tenantId } })
    if (!sub) throw notFound('Subscription')
    subscriptionId = sub.id
  }
  if (!subscriptionId) throw badRequest('subscriptionId or tenantId required')

  const sub = await ctx.db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, tenant: true },
  })
  if (!sub) throw notFound('Subscription')

  const periodStart = sub.currentEnd
  const periodEnd = cycleEnd(periodStart, sub.cycle)
  const dueAt = addDays(new Date(), input.dueInDays)
  const number = await nextInvoiceNumber(ctx.db)

  const invoice = await ctx.db.subscriptionInvoice.create({
    data: {
      subscriptionId: sub.id,
      number,
      amountMinor: sub.plan.priceMinor,
      currency: sub.plan.currency,
      status: 'DUE',
      periodStart,
      periodEnd,
      notes: input.notes ?? null,
      dueAt,
    },
    include: { subscription: { include: { tenant: true, plan: true } } },
  })

  await audit({
    tenantId: sub.tenantId,
    actorId: ctx.user.userId,
    action: 'invoice.generate',
    module: 'platform',
    entityType: 'SubscriptionInvoice',
    entityId: invoice.id,
    summary: `Generated ${number} for ${sub.tenant.name}`,
    after: { number, amountMinor: invoice.amountMinor },
  })

  return invoice
}

export async function markInvoicePaid(ctx: PlatformContext, id: string) {
  const before = await ctx.db.subscriptionInvoice.findUnique({
    where: { id },
    include: { subscription: true },
  })
  if (!before) throw notFound('Invoice')
  if (before.status === 'PAID') throw badRequest('Invoice is already paid')
  if (before.status === 'VOID') throw badRequest('Cannot pay a void invoice')

  const paidAt = new Date()
  const invoice = await ctx.db.subscriptionInvoice.update({
    where: { id },
    data: { status: 'PAID', paidAt },
    include: { subscription: { include: { tenant: true, plan: true } } },
  })

  const sub = before.subscription
  if (sub && before.periodEnd) {
    await ctx.db.subscription.update({
      where: { id: sub.id },
      data: {
        currentStart: before.periodStart ?? sub.currentEnd,
        currentEnd: before.periodEnd,
        status: 'ACTIVE',
      },
    })
    await ctx.db.tenant.update({
      where: { id: sub.tenantId },
      data: { status: 'ACTIVE' },
    })
  }

  await audit({
    tenantId: sub.tenantId,
    actorId: ctx.user.userId,
    action: 'invoice.pay',
    module: 'platform',
    entityType: 'SubscriptionInvoice',
    entityId: id,
    summary: `Marked ${before.number} paid`,
  })

  return invoice
}

export async function voidInvoice(ctx: PlatformContext, id: string) {
  const before = await ctx.db.subscriptionInvoice.findUnique({
    where: { id },
    include: { subscription: { select: { tenantId: true } } },
  })
  if (!before) throw notFound('Invoice')
  if (before.status === 'PAID') throw badRequest('Cannot void a paid invoice')

  const invoice = await ctx.db.subscriptionInvoice.update({
    where: { id },
    data: { status: 'VOID' },
  })

  await audit({
    tenantId: before.subscription.tenantId,
    actorId: ctx.user.userId,
    action: 'invoice.void',
    module: 'platform',
    entityType: 'SubscriptionInvoice',
    entityId: id,
    summary: `Voided ${before.number}`,
  })

  return invoice
}

/** Scan overdue DUE invoices → tenant + subscription PAST_DUE. */
export async function runOverdueScan(ctx: PlatformContext) {
  const now = new Date()
  const overdue = await ctx.db.subscriptionInvoice.findMany({
    where: { status: 'DUE', dueAt: { lt: now } },
    include: { subscription: { include: { tenant: { select: { id: true, status: true } } } } },
  })

  const tenantIds = new Set<string>()
  await ctx.db.$transaction(async (tx) => {
    for (const inv of overdue) {
      if (inv.subscription.tenant.status === 'PAST_DUE') continue
      await tx.tenant.update({
        where: { id: inv.subscription.tenantId },
        data: { status: 'PAST_DUE' },
      })
      await tx.subscription.update({
        where: { id: inv.subscriptionId },
        data: { status: 'PAST_DUE' },
      })
      tenantIds.add(inv.subscription.tenantId)
    }
  })

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    action: 'invoice.overdue.scan',
    module: 'platform',
    summary: `Marked ${tenantIds.size} tenant(s) past due`,
    after: { count: tenantIds.size },
  })

  return { updated: tenantIds.size, invoices: overdue.map((i) => i.id) }
}

export async function setCancelAtEnd(ctx: PlatformContext, tenantId: string, cancelAtEnd: boolean) {
  const sub = await ctx.db.subscription.findUnique({ where: { tenantId } })
  if (!sub) throw notFound('Subscription')
  return ctx.db.subscription.update({
    where: { tenantId },
    data: { cancelAtEnd },
  })
}
