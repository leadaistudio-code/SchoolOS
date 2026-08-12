import { NextResponse } from 'next/server'
import { destroyCurrentSession, getSessionUser } from '@/server/auth/session'
import { audit } from '@/server/audit'
import { publicRoute } from '@/server/api/handler'

/** POST /api/v1/auth/logout - revokes the session server-side, not just the cookie. */
export const POST = publicRoute(async () => {
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

  // Relative on purpose. `req.url` is the address the *container* was reached
  // on — behind Railway's proxy that is `localhost:8080`, so an absolute URL
  // built from it sends the browser somewhere that does not exist. A relative
  // Location also keeps a school on whichever host it signed in from, which
  // `APP_URL` would not: a school on its own domain must come back to that
  // domain, not to the platform's.
  return new NextResponse(null, { status: 303, headers: { Location: '/login' } })
})
