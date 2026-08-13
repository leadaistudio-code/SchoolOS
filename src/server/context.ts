import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSessionUser, type SessionUser } from '@/server/auth/session'
import { resolveTenant, type ResolvedTenant } from '@/server/tenant'
import { tenantDb, type TenantClient } from '@/server/db/tenant-client'
import { prisma } from '@/server/db/prisma'

export class AuthError extends Error {
  status = 401
  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'AuthError'
  }
}

export class ForbiddenError extends Error {
  status = 403
  constructor(message = 'You do not have permission to do this') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export type AppContext = {
  user: SessionUser
  tenant: ResolvedTenant
  db: TenantClient
  can: (permission: string) => boolean
  canAny: (...permissions: string[]) => boolean
  require: (permission: string) => void
}

/**
 * The single entry point for authenticated, tenant-bound work.
 *
 * It proves three things before any handler sees a request:
 *   1. there is a live session,
 *   2. the request resolved to a real tenant,
 *   3. the session belongs to THAT tenant (a valid cookie from school A is
 *      worthless on school B's host).
 */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const [user, tenant] = await Promise.all([getSessionUser(), resolveTenant()])
  if (!user || !tenant) return null

  // Cross-tenant cookie replay: a session minted for another school is not
  // accepted here, even though the cookie itself is valid.
  if (user.tenantId !== tenant.id) return null

  // Suspended schools cannot use the ERP unless a platform admin is impersonating.
  if (tenant.status === 'SUSPENDED' && !user.impersonatedById) return null

  const db = tenantDb(tenant.id)
  const can = (permission: string) => user.permissions.has(permission)

  return {
    user,
    tenant,
    db,
    can,
    canAny: (...perms: string[]) => perms.some(can),
    require: (permission: string) => {
      if (!can(permission)) {
        throw new ForbiddenError(`Missing permission: ${permission}`)
      }
    },
  }
})

/** Server-component guard: redirects instead of throwing. */
export async function requireContext(permission?: string): Promise<AppContext> {
  const user = await getSessionUser()
  const tenant = await resolveTenant()

  if (user && tenant && user.tenantId === tenant.id && tenant.status === 'SUSPENDED' && !user.impersonatedById) {
    redirect('/suspended')
  }

  const ctx = await getContext()
  if (!ctx) redirect('/login')
  if (ctx.user.mustChangePassword) redirect('/account/password')
  if (permission && !ctx.can(permission)) redirect('/403')
  return ctx
}

function buildAppContext(user: SessionUser, tenant: ResolvedTenant): AppContext {
  const db = tenantDb(tenant.id)
  const can = (permission: string) => user.permissions.has(permission)
  return {
    user,
    tenant,
    db,
    can,
    canAny: (...perms: string[]) => perms.some(can),
    require: (permission: string) => {
      if (!can(permission)) {
        throw new ForbiddenError(`Missing permission: ${permission}`)
      }
    },
  }
}

/**
 * Support context for suspended schools: allows ticket access without full ERP.
 */
export async function requireSupportContext(permission?: string): Promise<AppContext> {
  const [user, tenant] = await Promise.all([getSessionUser(), resolveTenant()])
  if (!user || !tenant || user.tenantId !== tenant.id) redirect('/login')

  const suspended = tenant.status === 'SUSPENDED' && !user.impersonatedById
  if (!suspended) {
    return requireContext(permission)
  }

  if (!user.permissions.has('support.view') && !user.permissions.has('support.create')) {
    redirect('/suspended')
  }

  const ctx = buildAppContext(user, tenant)
  if (ctx.user.mustChangePassword) redirect('/account/password')
  if (permission && !ctx.can(permission)) redirect('/403')
  return ctx
}

/** API guard for support routes on suspended tenants. */
export async function requireSupportApiContext(permission?: string): Promise<AppContext> {
  const [user, tenant] = await Promise.all([getSessionUser(), resolveTenant()])
  if (!user || !tenant || user.tenantId !== tenant.id) throw new AuthError()

  const suspended = tenant.status === 'SUSPENDED' && !user.impersonatedById
  if (!suspended) {
    return requireApiContext(permission)
  }

  if (!user.permissions.has('support.view') && !user.permissions.has('support.create')) {
    throw new ForbiddenError('Account suspended')
  }

  const ctx = buildAppContext(user, tenant)
  if (permission) ctx.require(permission)
  return ctx
}

/** API guard: throws typed errors the route wrapper turns into JSON. */
export async function requireApiContext(permission?: string): Promise<AppContext> {
  const ctx = await getContext()
  if (!ctx) throw new AuthError()
  if (permission) ctx.require(permission)
  return ctx
}

export type PlatformContext = { user: SessionUser; db: typeof prisma }

/**
 * Platform (super admin) context. Deliberately separate: it is not tenant
 * bound and uses the unscoped client, so it can never be reached by accident
 * from a tenant route.
 */
export const getPlatformContext = cache(async (): Promise<PlatformContext | null> => {
  const user = await getSessionUser()
  if (!user || !user.isSuperAdmin) return null
  return { user, db: prisma }
})

export async function requirePlatformContext(
  permission?: string,
): Promise<PlatformContext> {
  const ctx = await getPlatformContext()
  if (!ctx) redirect('/login')
  if (permission && !ctx.user.permissions.has(permission)) redirect('/403')
  return ctx
}

/** API guard for platform routes. */
export async function requirePlatformApiContext(
  permission?: string,
): Promise<PlatformContext> {
  const ctx = await getPlatformContext()
  if (!ctx) throw new AuthError()
  if (permission && !ctx.user.permissions.has(permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`)
  }
  return ctx
}
