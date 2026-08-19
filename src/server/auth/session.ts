import { cookies, headers } from 'next/headers'
import { prisma } from '@/server/db/prisma'
import { env, isProd } from '@/lib/env'
import { randomToken, sha256 } from '@/server/crypto'

export const SESSION_COOKIE = 'mycampusview_session'

/** Cookie domain shared across tenant subdomains (e.g. `.lvh.me`, `.schoolos.app`). */
export function sessionCookieDomain(host?: string | null): string | undefined {
  const root = env().APP_ROOT_DOMAIN.split(':')[0]!.toLowerCase()
  if (root === 'localhost' || root === '127.0.0.1' || root.endsWith('.localhost')) {
    return undefined
  }
  if (!root.includes('.')) return undefined

  const bare = (host ?? root).split(':')[0]!.toLowerCase()
  const normalizedRoot = root.startsWith('.') ? root.slice(1) : root

  // Only attach a shared domain when the request host belongs to our root.
  if (bare !== normalizedRoot && !bare.endsWith(`.${normalizedRoot}`)) {
    return undefined
  }

  return `.${normalizedRoot}`
}

async function sessionCookieOptions(expires: Date) {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const domain = sessionCookieDomain(host)
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
  jar.set(SESSION_COOKIE, token, await sessionCookieOptions(expiresAt))

  // The raw token is returned alongside the row so a native client can be
  // handed the credential it will present as a bearer. It is the only moment
  // it exists in plaintext — the database holds nothing but its SHA-256 — so
  // the mobile sign-in route is the one caller that reads it. Web callers
  // ignore it and keep using the cookie.
  return Object.assign(session, { token })
}

export async function destroyCurrentSession() {
  const jar = await cookies()
  // Resolved from either transport, so signing out of the mobile app revokes
  // the row rather than only clearing a cookie that was never set.
  const token = await sessionToken()
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
  jar.delete({ name: SESSION_COOKIE, ...(await sessionCookieOptions(new Date(0))) })
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
 * The session token for this request, from either transport.
 *
 * The browser sends a cookie. A native client cannot: there is no cookie jar
 * worth relying on, no shared subdomain to scope one to, and a `SameSite`
 * policy written for a browser means nothing to an Android app. So mobile
 * presents the same opaque token as a bearer credential instead.
 *
 * That works because sessions were never JWTs — the token is a random string
 * whose SHA-256 is the primary key of a server-side row. Bearer and cookie are
 * two envelopes around one credential, so revocation, expiry, "log out
 * everywhere" and the device list keep working identically for both.
 *
 * The cookie is read first, so nothing about the web application changes: a
 * browser request never reaches the header branch.
 */
async function sessionToken(): Promise<string | null> {
  const jar = await cookies()
  const cookieToken = jar.get(SESSION_COOKIE)?.value
  if (cookieToken) return cookieToken

  const authorization = (await headers()).get('authorization')
  if (!authorization) return null

  // Case-insensitive scheme, exactly one space, non-empty token. Anything else
  // is not a bearer credential and must not be guessed at.
  const match = /^Bearer[ ]+(\S+)$/i.exec(authorization.trim())
  return match?.[1] ?? null
}

/**
 * Resolves the current session and materialises the effective permission set
 * by unioning every assigned role. Returns null for anonymous, expired or
 * revoked sessions - callers must never treat null as "allow".
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await sessionToken()
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
