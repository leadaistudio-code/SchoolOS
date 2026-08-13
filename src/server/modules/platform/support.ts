import type { PlatformContext } from '@/server/context'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, notFound } from '@/server/api/response'
import { paginationMeta } from '@/server/api/response'
import type {
  supportMessageSchema,
  supportTicketCreateSchema,
  supportTicketUpdateSchema,
  listSupportTicketsSchema,
} from './schema'
import type { z } from 'zod'

export async function listPlatformTickets(
  ctx: PlatformContext,
  query: z.infer<typeof listSupportTicketsSchema>,
) {
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
  }

  const [total, rows] = await Promise.all([
    ctx.db.supportTicket.count({ where }),
    ctx.db.supportTicket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
  ])

  return { rows, meta: paginationMeta(query.page, query.pageSize, total) }
}

export async function getPlatformTicket(ctx: PlatformContext, id: string) {
  const ticket = await ctx.db.supportTicket.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!ticket) throw notFound('Ticket')
  return ticket
}

export async function updatePlatformTicket(
  ctx: PlatformContext,
  id: string,
  input: z.infer<typeof supportTicketUpdateSchema>,
) {
  const before = await ctx.db.supportTicket.findUnique({ where: { id } })
  if (!before) throw notFound('Ticket')

  const resolvedAt =
    input.status === 'RESOLVED' || input.status === 'CLOSED'
      ? new Date()
      : input.status
        ? null
        : undefined

  const ticket = await ctx.db.supportTicket.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(resolvedAt !== undefined ? { resolvedAt } : {}),
    },
    include: { tenant: true, messages: { orderBy: { createdAt: 'asc' } } },
  })

  await audit({
    tenantId: before.tenantId,
    actorId: ctx.user.userId,
    action: 'ticket.status',
    module: 'platform',
    entityType: 'SupportTicket',
    entityId: id,
    summary: `Ticket ${before.subject} → ${input.status ?? 'updated'}`,
    before: { status: before.status, assigneeId: before.assigneeId },
    after: input,
  })

  return ticket
}

export async function replyPlatformTicket(
  ctx: PlatformContext,
  id: string,
  input: z.infer<typeof supportMessageSchema>,
) {
  const ticket = await ctx.db.supportTicket.findUnique({ where: { id } })
  if (!ticket) throw notFound('Ticket')

  const message = await ctx.db.supportTicketMessage.create({
    data: {
      ticketId: id,
      authorId: ctx.user.userId,
      authorKind: 'PLATFORM',
      body: input.body,
    },
  })

  await ctx.db.supportTicket.update({
    where: { id },
    data: { status: ticket.status === 'OPEN' ? 'PENDING' : ticket.status, updatedAt: new Date() },
  })

  return message
}

// --- Tenant-scoped ---

export async function listTenantTickets(ctx: AppContext) {
  return ctx.db.supportTicket.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
}

export async function getTenantTicket(ctx: AppContext, id: string) {
  const ticket = await ctx.db.supportTicket.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) throw notFound('Ticket')
  return ticket
}

export async function createTenantTicket(
  ctx: AppContext,
  input: z.infer<typeof supportTicketCreateSchema>,
) {
  const ticket = await ctx.db.supportTicket.create({
    data: {
      tenantId: ctx.tenant.id,
      subject: input.subject,
      body: input.body,
      category: input.category ?? null,
      priority: input.priority,
      openedById: ctx.user.userId,
      messages: {
        create: {
          authorId: ctx.user.userId,
          authorKind: 'TENANT',
          body: input.body,
        },
      },
    },
    include: { messages: true },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    action: 'ticket.create',
    module: 'support',
    entityType: 'SupportTicket',
    entityId: ticket.id,
    summary: input.subject,
  })

  return ticket
}

export async function replyTenantTicket(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof supportMessageSchema>,
) {
  const ticket = await ctx.db.supportTicket.findFirst({
    where: { id, tenantId: ctx.tenant.id },
  })
  if (!ticket) throw notFound('Ticket')
  if (ticket.status === 'CLOSED') throw badRequest('Ticket is closed')

  const message = await ctx.db.supportTicket.update({
    where: { id },
    data: {
      status: 'OPEN',
      updatedAt: new Date(),
      messages: {
        create: {
          authorId: ctx.user.userId,
          authorKind: 'TENANT',
          body: input.body,
        },
      },
    },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })

  return message.messages[0]!
}
