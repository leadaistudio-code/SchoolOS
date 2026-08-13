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
  passwordResetRequestSchema,
} from './schema'
import type { z } from 'zod'
import { prisma } from '@/server/db/prisma'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'

export const PASSWORD_RESET_CATEGORY = 'password_reset'

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

/**
 * Password reset from the public sign-in page (no session).
 *
 * Creates a platform support ticket so an operator can run the reset script and
 * contact the user out of band. Always returns success to the caller — even when
 * the email is unknown or a ticket already exists — so the form cannot be used
 * to enumerate accounts.
 */
export async function createPasswordResetTicket(
  input: z.infer<typeof passwordResetRequestSchema> & {
    tenantId: string
    tenantName: string
    ip?: string | null
  },
): Promise<{ created: boolean }> {
  const email = input.email.trim().toLowerCase()

  const byEmail = await rateLimit(
    `password-reset:email:${input.tenantId}:${email}`,
    RATE_LIMITS.passwordResetRequest.limit,
    RATE_LIMITS.passwordResetRequest.windowSeconds,
  )
  const byIp = await rateLimit(
    `password-reset:ip:${input.ip ?? 'unknown'}`,
    RATE_LIMITS.passwordResetRequest.limit * 2,
    RATE_LIMITS.passwordResetRequest.windowSeconds,
  )
  if (!byEmail.ok || !byIp.ok) {
    return { created: false }
  }

  const subject = `Password reset — ${email}`

  const existing = await prisma.supportTicket.findFirst({
    where: {
      tenantId: input.tenantId,
      category: PASSWORD_RESET_CATEGORY,
      subject,
      status: { in: ['OPEN', 'PENDING'] },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  })
  if (existing) return { created: false }

  const account = await prisma.user.findFirst({
    where: { tenantId: input.tenantId, email, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, status: true },
  })

  const body = [
    'Password reset requested from the school sign-in page.',
    '',
    `School: ${input.tenantName}`,
    `Email: ${email}`,
    account
      ? `Account: ${account.firstName} ${account.lastName} (${account.status.toLowerCase()})`
      : 'Account: no matching user found for this email at this school',
    input.note ? `User note: ${input.note}` : null,
    '',
    'Platform action: reset with scripts/reset-user-password.ts and share the temporary password out of band.',
    input.ip ? `Request IP: ${input.ip}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  await prisma.supportTicket.create({
    data: {
      tenantId: input.tenantId,
      subject,
      body,
      category: PASSWORD_RESET_CATEGORY,
      priority: 'HIGH',
      status: 'OPEN',
      openedById: account?.id ?? null,
      messages: {
        create: {
          authorKind: 'TENANT',
          authorId: account?.id ?? null,
          body,
        },
      },
    },
  })

  return { created: true }
}
