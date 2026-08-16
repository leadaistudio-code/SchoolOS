import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { completeWithToken } from '@/server/auth/reset'
import { resolveTenant } from '@/server/tenant'

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  purpose: z.enum(['PASSWORD_RESET', 'INVITE']).default('PASSWORD_RESET'),
})

/**
 * POST /api/v1/auth/password/reset
 *
 * Redeems a reset or invitation link. Deliberately returns no session: the
 * client must sign in afterwards, so an account with MFA still has to present
 * its second factor.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const tenant = await resolveTenant()
  if (!tenant) {
    throw new ApiException(400, 'NO_TENANT', 'Connect to your school address first')
  }

  const body = schema.parse(await req.json())
  const result = await completeWithToken(body.token, body.purpose, tenant.id, body.password)

  if (!result.ok) {
    throw new ApiException(
      result.field === 'password' ? 422 : 400,
      result.field === 'password' ? 'WEAK_PASSWORD' : 'INVALID_TOKEN',
      result.message,
    )
  }

  return ok({ passwordSet: true })
})
