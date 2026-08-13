import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, notFound } from '@/server/api/response'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'

export const USER_SORT_FIELDS = ['createdAt', 'lastLoginAt', 'lastName', 'status'] as const

export const userStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['INVITED', 'ACTIVE', 'DISABLED']),
})

export const userRolesSchema = z.object({
  id: z.string().min(1),
  roleIds: z.array(z.string().min(1)).max(20).default([]),
})

/**
 * Portal accounts.
 *
 * Every person who can sign in — staff, parents and students alike — is one
 * row here, so this is where an account is disabled when somebody leaves.
 * The list carries the last sign-in because a school's real question is
 * usually "who has never actually logged in", not "who exists".
 */
export async function listUsers(
  ctx: AppContext,
  query: ListQuery,
  filter: { roleId?: string; status?: string } = {},
) {
  ctx.require('users.view')

  const where = {
    deletedAt: null,
    ...(filter.status ? { status: filter.status as 'INVITED' | 'ACTIVE' | 'DISABLED' } : {}),
    ...(filter.roleId ? { roles: { some: { roleId: filter.roleId } } } : {}),
    ...(query.q
      ? {
          OR: [
            { firstName: { contains: query.q, mode: 'insensitive' as const } },
            { lastName: { contains: query.q, mode: 'insensitive' as const } },
            { email: { contains: query.q, mode: 'insensitive' as const } },
            { phone: { contains: query.q } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    ctx.db.user.findMany({
      where,
      ...skipTake(query),
      orderBy: orderByFrom(query.sort, query.dir, USER_SORT_FIELDS, { createdAt: 'desc' }),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        mfaEnabled: true,
        lockedUntil: true,
        createdAt: true,
        roles: { select: { role: { select: { id: true, key: true, name: true } } } },
        staff: { select: { id: true, employeeCode: true } },
        student: { select: { id: true, admissionNo: true } },
        parent: { select: { id: true } },
      },
    }),
    ctx.db.user.count({ where }),
  ])

  return { rows, total }
}

/** Headline counts for the strip above the table. */
export async function userCounts(ctx: AppContext) {
  ctx.require('users.view')
  const rows = await ctx.db.user.groupBy({
    by: ['status'],
    where: { deletedAt: null },
    _count: { _all: true },
  })
  const neverSignedIn = await ctx.db.user.count({
    where: { deletedAt: null, lastLoginAt: null, status: { not: 'DISABLED' } },
  })
  return {
    byStatus: Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<
      string,
      number
    >,
    neverSignedIn,
  }
}

/**
 * Enables, disables or re-invites an account.
 *
 * Disabling revokes live sessions in the same transaction. Flipping a status
 * without doing that would leave somebody signed in for as long as their
 * cookie lasted, which is precisely the window a departure is meant to close.
 */
export async function setUserStatus(ctx: AppContext, input: z.infer<typeof userStatusSchema>) {
  ctx.require('users.edit')

  const user = await ctx.db.user.findFirst({ where: { id: input.id, deletedAt: null } })
  if (!user) throw notFound('User')
  if (user.id === ctx.user.userId && input.status === 'DISABLED') {
    throw new ApiException(409, 'CONFLICT', 'You cannot disable your own account')
  }

  const updated = await ctx.db.$transaction(async (tx) => {
    const next = await tx.user.update({ where: { id: input.id }, data: { status: input.status } })
    if (input.status === 'DISABLED') {
      await tx.session.deleteMany({ where: { userId: input.id } })
    }
    return next
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'user.status',
    module: 'settings',
    entityType: 'User',
    entityId: input.id,
    summary: `${user.firstName} ${user.lastName} set to ${input.status.toLowerCase()}`,
    before: { status: user.status },
    after: { status: updated.status },
  })
  return updated
}

/**
 * Replaces an account's roles.
 *
 * Written as a delete-then-create pair inside one transaction so the stored
 * set always matches what was chosen — reconciling additions and removals
 * separately leaves a window where a user briefly holds both old and new.
 */
export async function setUserRoles(ctx: AppContext, input: z.infer<typeof userRolesSchema>) {
  ctx.require('users.roles')

  const user = await ctx.db.user.findFirst({
    where: { id: input.id, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, roles: { select: { roleId: true } } },
  })
  if (!user) throw notFound('User')

  const roles = await ctx.db.role.findMany({
    where: { id: { in: input.roleIds } },
    select: { id: true, name: true },
  })
  if (roles.length !== input.roleIds.length) throw notFound('Role')

  // Locking yourself out of role management is a support ticket nobody enjoys.
  if (user.id === ctx.user.userId && input.roleIds.length === 0) {
    throw new ApiException(409, 'CONFLICT', 'You cannot remove every role from your own account')
  }

  await ctx.db.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: input.id } })
    if (input.roleIds.length > 0) {
      await tx.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ tenantId: ctx.tenant.id, userId: input.id, roleId })),
      })
    }
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'user.roles',
    module: 'settings',
    entityType: 'User',
    entityId: input.id,
    summary: `${user.firstName} ${user.lastName} now holds ${roles.map((r) => r.name).join(', ') || 'no roles'}`,
    before: { roleIds: user.roles.map((r) => r.roleId) },
    after: { roleIds: input.roleIds },
  })
}
