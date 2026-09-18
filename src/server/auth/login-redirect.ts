import type { SessionUser } from '@/server/auth/session'
import type { ResolvedTenant } from '@/server/tenant'
import { env } from '@/lib/env'
import { prisma } from '@/server/db/prisma'

/**
 * Paths that must never be used as a post-login bounce target — they feed
 * redirect loops when a session is valid for the cookie domain but not for
 * this host (tenant user on app./platform, school A cookie on school B).
 */
export function sanitizeLoginNext(next: string | null | undefined): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  const path = next.split('?')[0]!.split('#')[0]!
  if (
    path === '/login' ||
    path.startsWith('/login/') ||
    path === '/account/password' ||
    path.startsWith('/account/password/')
  ) {
    return null
  }
  return next
}

export type ExistingSessionDestination =
  | { kind: 'redirect'; href: string }
  | { kind: 'mismatch'; reason: 'wrong-school' | 'tenant-on-platform' | 'platform-on-school' }

/**
 * Where an already-authenticated browser should go on this host — or whether
 * the session does not belong here and login must stay put (no redirect).
 */
export function destinationForExistingSession(input: {
  user: SessionUser
  tenant: ResolvedTenant | null
  next?: string | null
}): ExistingSessionDestination {
  const next = sanitizeLoginNext(input.next)
  const isPlatformUser = input.user.tenantId === null

  if (input.tenant) {
    if (input.user.tenantId === input.tenant.id) {
      if (input.user.mustChangePassword) {
        return { kind: 'redirect', href: '/account/password' }
      }
      // Tenant sessions never belong in the platform console.
      if (next?.startsWith('/platform')) {
        return { kind: 'redirect', href: '/' }
      }
      return { kind: 'redirect', href: next ?? '/' }
    }
    if (isPlatformUser) {
      return { kind: 'mismatch', reason: 'platform-on-school' }
    }
    return { kind: 'mismatch', reason: 'wrong-school' }
  }

  // Platform / app host — no school tenant on this hostname.
  if (isPlatformUser) {
    if (input.user.mustChangePassword) {
      return { kind: 'redirect', href: '/account/password' }
    }
    if (next?.startsWith('/platform')) {
      return { kind: 'redirect', href: next }
    }
    return { kind: 'redirect', href: '/platform' }
  }

  return { kind: 'mismatch', reason: 'tenant-on-platform' }
}

/** Absolute school URL for a tenant session that landed on the platform host. */
export async function tenantHomeUrlForUser(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: {
      slug: true,
      domains: {
        where: { verified: true },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: { host: true },
      },
    },
  })
  if (!tenant) return null

  const primary = tenant.domains[0]?.host
  if (primary) {
    const host = primary.replace(/^https?:\/\//, '')
    return `https://${host}`
  }

  const root = env().APP_ROOT_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const local = root.includes('localhost') || root.includes('lvh.me') || root.includes('127.0.0.1')
  const protocol = local ? 'http' : 'https'
  return `${protocol}://${tenant.slug}.${root}`
}

export const SESSION_MISMATCH_COPY: Record<
  'wrong-school' | 'tenant-on-platform' | 'platform-on-school',
  string
> = {
  'wrong-school':
    'You are signed in to a different school in this browser. Sign out below, then sign in here.',
  'tenant-on-platform':
    'You are signed in to a school account. Open your school’s address to continue, or sign out to use the platform console.',
  'platform-on-school':
    'You are signed in as a platform administrator. Sign out below to use this school’s sign-in page.',
}
