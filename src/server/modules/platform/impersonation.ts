import type { PlatformContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, forbidden, notFound } from '@/server/api/response'
import { createSession, destroyCurrentSession, requestMeta } from '@/server/auth/session'
import { prisma } from '@/server/db/prisma'
import { platformUrl, tenantUrl } from '@/server/tenant'
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

export async function stopImpersonation(currentSessionId: string, impersonatedById: string | null) {
  if (!impersonatedById) throw badRequest('Not impersonating')

  const platformUser = await prisma.user.findUnique({
    where: { id: impersonatedById },
    select: { id: true, tenantId: true, isSuperAdmin: true, status: true },
  })
  if (!platformUser?.isSuperAdmin || platformUser.status !== 'ACTIVE') {
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
    summary: 'Stopped impersonation',
  })

  return { redirectTo: platformUrl('/platform') }
}
