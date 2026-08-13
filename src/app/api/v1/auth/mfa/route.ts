import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { completeMfaChallenge } from '@/server/modules/mfa/service'
import { resolveTenant } from '@/server/tenant'
import { getSessionUser } from '@/server/auth/session'

const schema = z.object({
  challengeToken: z.string().min(20),
  code: z.string().trim().regex(/^\d{6}$/),
})

/** Complete an MFA challenge started by POST /api/v1/auth/login. */
export const POST = publicRoute(async (req: NextRequest) => {
  const body = schema.parse(await req.json())
  const result = await completeMfaChallenge(body.challengeToken, body.code)
  if (!result.ok) {
    throw new ApiException(401, 'INVALID_CREDENTIALS', result.message)
  }

  const tenant = await resolveTenant()
  const user = await getSessionUser()
  return ok({
    user: user
      ? {
          id: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          roles: user.roleKeys,
          mustChangePassword: user.mustChangePassword,
        }
      : null,
    tenant: tenant ? { id: tenant.id, slug: tenant.slug, name: tenant.name } : null,
  })
})
