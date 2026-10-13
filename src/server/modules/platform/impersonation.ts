import type { PlatformContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, forbidden, notFound } from '@/server/api/response'
import { createSession, destroyCurrentSession, requestMeta } from '@/server/auth/session'
import { prisma } from '@/server/db/prisma'
import { platformUrl, tenantUrl } from '@/server/tenant'
import { ROLE } from '@/lib/rbac/roles'
import type { impersonateSchema } from './schema'
import type { z } from 'zod'

export async function startImpersonation(
  ctx: PlatformContext,
  input: z.infer<typeof impersonateSchema>,
) {
  if (!ctx.user.permissions.has('platform.impersonate')) {
    throw forbidden('Missing platform.impersonate')
  }

  const target = await ctx.db.user.findFirst({
    where: { id: input.userId, tenantId: input.tenantId, deletedAt: null, status: 'ACTIVE' },
  })
  if (!target) throw notFound('User')
  if (target.isSuperAdmin) throw badRequest('Cannot impersonate platform administrators')

  const tenant = await ctx.db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { slug: true },
  })

  // End the platform session cookie; the new session is the target user.
  await destroyCurrentSession()

  const meta = await requestMeta()
  const session = await createSession({
    userId: target.id,
    tenantId: target.tenantId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    impersonatedById: ctx.user.userId,
  })

  await audit({
    tenantId: input.tenantId,
    actorId: ctx.user.userId,
    action: 'impersonation.start',
    module: 'platform',
    entityType: 'User',
    entityId: target.id,
    summary: `Impersonating ${target.email ?? target.id}`,
  })

  const slug = tenant?.slug
  const redirectTo = slug ? tenantUrl(slug, '/') : platformUrl('/platform')

  return { sessionId: session.id, redirectTo }
}

/**
 * Open a school with full MyCampus Support access.
 *
 * Picks the school's admin (or principal) so the session is tied to a real
 * account for the audit trail, then elevates permissions in getSessionUser so
 * support is never blocked by the target user's role.
 */
export async function enterSchoolAsSupport(ctx: PlatformContext, tenantId: string) {
  if (!ctx.user.permissions.has('platform.impersonate')) {
    throw forbidden('Missing platform.impersonate')
  }

  const tenant = await ctx.db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true },
  })
  if (!tenant) throw notFound('School')

  const preferredRoles = [ROLE.SCHOOL_ADMIN, ROLE.PRINCIPAL] as const
  let targetId: string | null = null
  for (const roleKey of preferredRoles) {
    const user = await ctx.db.user.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        status: 'ACTIVE',
        roles: { some: { role: { key: roleKey } } },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (user) {
      targetId = user.id
      break
    }
  }

  if (!targetId) {
    const anyStaff = await ctx.db.user.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        status: 'ACTIVE',
        isSuperAdmin: false,
        NOT: {
          roles: {
            some: { role: { key: { in: [ROLE.STUDENT, ROLE.PARENT] } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    targetId = anyStaff?.id ?? null
  }

  if (!targetId) {
    throw badRequest(
      'This school has no active staff account to open. Create a school admin first.',
    )
  }

  const result = await startImpersonation(ctx, { tenantId, userId: targetId })

  await audit({
    tenantId,
    actorId: ctx.user.userId,
    action: 'support.enter_school',
    module: 'platform',
    entityType: 'Tenant',
    entityId: tenantId,
    summary: `MyCampus Support opened ${tenant.name} with full access`,
  })

  return result
}

export async function stopImpersonation(currentSessionId: string, impersonatedById: string | null) {
  if (!impersonatedById) throw badRequest('Not impersonating')

  const platformUser = await prisma.user.findUnique({
    where: { id: impersonatedById },
    select: { id: true, tenantId: true, status: true },
  })
  // Any active platform operator (tenantId null) may reclaim their session —
  // MyCampus Support is not isSuperAdmin and must still be able to Exit.
  if (!platformUser || platformUser.status !== 'ACTIVE' || platformUser.tenantId !== null) {
    throw forbidden('Original platform session invalid')
  }

  await prisma.session.update({
    where: { id: currentSessionId },
    data: { revokedAt: new Date() },
  })

  const meta = await requestMeta()
  await createSession({
    userId: platformUser.id,
    tenantId: platformUser.tenantId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  await audit({
    tenantId: null,
    actorId: impersonatedById,
    action: 'impersonation.stop',
    module: 'platform',
    entityType: 'Session',
    entityId: currentSessionId,
    summary: 'Stopped impersonation',
  })

  return { redirectTo: platformUrl('/platform') }
}
