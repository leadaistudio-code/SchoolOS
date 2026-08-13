import { cookies, headers } from 'next/headers'
import { prisma } from '@/server/db/prisma'
import { env, isProd } from '@/lib/env'
import { randomToken, sha256 } from '@/server/crypto'

export const SESSION_COOKIE = 'schoolos_session'

/** Cookie domain shared across tenant subdomains (e.g. `.lvh.me`, `.schoolos.app`). */
export function sessionCookieDomain(): string | undefined {
  const root = env().APP_ROOT_DOMAIN.split(':')[0]!.toLowerCase()
  if (root === 'localhost' || root === '127.0.0.1' || root.endsWith('.localhost')) {
    return undefined
  }
  if (!root.includes('.')) return undefined
  return root.startsWith('.') ? root : `.${root}`
}

function sessionCookieOptions(expires: Date) {
  const domain = sessionCookieDomain()
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd(),
    path: '/',
    expires,
    ...(domain ? { domain } : {}),
  }
}

export type SessionUser = {
  sessionId: string
  userId: string
  tenantId: string | null
  isSuperAdmin: boolean
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  avatarUrl: string | null
  mustChangePassword: boolean
  roleKeys: string[]
  permissions: Set<string>
  impersonatedById: string | null
}

type CreateSessionInput = {
  userId: string
  tenantId: string | null
  ip?: string | null
  userAgent?: string | null
  impersonatedById?: string | null
}

/**
 * Sessions are opaque random tokens stored hashed server-side, not JWTs.
 * That makes "log out everywhere", per-device listings and instant revocation
 * on role change real rather than best-effort.
 */
export async function createSession(input: CreateSessionInput) {
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3600_000)

  const session = await prisma.session.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      tokenHash: sha256(token),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      device: describeDevice(input.userAgent ?? ''),
      impersonatedById: input.impersonatedById ?? null,
      expiresAt,
    },
  })

  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))

  return session
}

export async function destroyCurrentSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
  jar.delete({ name: SESSION_COOKIE, ...sessionCookieOptions(new Date(0)) })
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  })
}

/**
 * Resolves the current session and materialises the effective permission set
 * by unioning every assigned role. Returns null for anonymous, expired or
 * revoked sessions - callers must never treat null as "allow".
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      },
    },
  })

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null
  if (session.user.status !== 'ACTIVE' || session.user.deletedAt) return null

  // Cheap liveness update; skipped when it would write on every request.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    })
  }

  const permissions = new Set<string>()
  const roleKeys: string[] = []
  for (const ur of session.user.roles) {
    roleKeys.push(ur.role.key)
    for (const rp of ur.role.permissions) permissions.add(rp.permission.key)
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    tenantId: session.user.tenantId,
    isSuperAdmin: session.user.isSuperAdmin,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    email: session.user.email,
    phone: session.user.phone,
    avatarUrl: session.user.avatarUrl,
    mustChangePassword: session.user.mustChangePassword,
    roleKeys,
    permissions,
    impersonatedById: session.impersonatedById,
  }
}

export async function requestMeta() {
  const h = await headers()
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null
  return { ip, userAgent: h.get('user-agent') }
}

function describeDevice(ua: string): string {
  if (/android/i.test(ua)) return 'Android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS'
  if (/windows/i.test(ua)) return 'Windows'
  if (/mac os/i.test(ua)) return 'macOS'
  if (/linux/i.test(ua)) return 'Linux'
  return 'Unknown device'
}
