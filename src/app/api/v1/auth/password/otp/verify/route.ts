import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { verifyWhatsappOtp } from '@/server/auth/otp'
import { resolveTenant } from '@/server/tenant'

const schema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().trim(),
})

/**
 * POST /api/v1/auth/password/otp/verify
 *
 * Exchanges a correct code for a short-lived reset token, which is then spent
 * against /auth/password/reset. No session is issued here, so MFA still stands
 * where a user has enabled it.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const tenant = await resolveTenant()
  if (!tenant) throw new ApiException(400, 'NO_TENANT', 'Connect to your school address first')

  const body = schema.parse(await req.json())
  const result = await verifyWhatsappOtp(body.challengeToken, body.code, tenant.id)

  if (!result.ok) {
    throw new ApiException(400, 'INVALID_CODE', result.message, {
      attemptsLeft: result.attemptsLeft,
    })
  }

  return ok({ resetToken: result.resetToken })
})
