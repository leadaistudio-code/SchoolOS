import { NextResponse } from 'next/server'
import { destroyCurrentSession, getSessionUser } from '@/server/auth/session'
import { audit } from '@/server/audit'
import { publicRoute } from '@/server/api/handler'

/** POST /api/v1/auth/logout - revokes the session server-side, not just the cookie. */
export const POST = publicRoute(async (req) => {
  const user = await getSessionUser()
  await destroyCurrentSession()

  if (user) {
    await audit({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorLabel: `${user.firstName} ${user.lastName}`,
      action: 'auth.logout',
      module: 'auth',
      summary: 'Signed out',
    })
  }

  return NextResponse.redirect(new URL('/login', req.url), { status: 303 })
})
