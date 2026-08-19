import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { login } from '@/server/auth/login'
import { resolveTenant } from '@/server/tenant'
import { getSessionUser } from '@/server/auth/session'
import { env } from '@/lib/env'

/**
 * How a client says it cannot hold a cookie. Sent as `bearer` by the Android
 * app; absent from every browser request.
 */
export const SESSION_TRANSPORT_HEADER = 'x-session-transport'

const schema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
})

/**
 * POST /api/v1/auth/login
 *
 * The same login service the web form uses, exposed for native clients. The
 * tenant is taken from the request host, never from the body, so credentials
 * cannot be aimed at a school the caller did not connect to. On success the
 * session cookie is set by the service.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const tenant = await resolveTenant()
  const body = schema.parse(await req.json())

  const result = await login({
    identifier: body.identifier,
    password: body.password,
    tenantId: tenant?.id ?? null,
  })

  if (!result.ok) {
    if (result.reason === 'mfa') {
      return ok({
        mfaRequired: true,
        challengeToken: result.challengeToken,
      })
    }
    throw new ApiException(
      result.retryAfterSeconds ? 429 : 401,
      result.retryAfterSeconds ? 'RATE_LIMITED' : 'INVALID_CREDENTIALS',
      result.message,
    )
  }

  const user = await getSessionUser()

  // The session token is returned only to a client that asked for it. A
  // browser must never receive it in a body: the whole point of the httpOnly
  // cookie is that page scripts cannot read the credential, and echoing it
  // here would hand it to anything that manages to run script on the page.
  // The web form does not send this header, so its response is unchanged.
  const wantsBearer = req.headers.get(SESSION_TRANSPORT_HEADER)?.toLowerCase() === 'bearer'

  return ok({
    user: user
      ? {
          id: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          roles: user.roleKeys,
          permissions: [...user.permissions],
          mustChangePassword: user.mustChangePassword,
        }
      : null,
    tenant: tenant ? { id: tenant.id, slug: tenant.slug, name: tenant.name } : null,
    ...(wantsBearer ? { sessionToken: result.sessionToken, expiresInHours: env().SESSION_TTL_HOURS } : {}),
  })
})
