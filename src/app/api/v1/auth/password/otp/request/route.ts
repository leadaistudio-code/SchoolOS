import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { requestWhatsappOtp } from '@/server/auth/otp'
import { resolveTenant } from '@/server/tenant'

const schema = z.object({ phone: z.string().trim().min(6) })

/**
 * POST /api/v1/auth/password/otp/request
 *
 * Sends a WhatsApp reset code. A number that belongs to nobody still receives
 * a challenge, so a native client cannot enumerate a school's families any
 * more than the browser can.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const tenant = await resolveTenant()
  if (!tenant) throw new ApiException(400, 'NO_TENANT', 'Connect to your school address first')

  const body = schema.parse(await req.json())
  const result = await requestWhatsappOtp(body.phone, {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.school?.name ?? tenant.name,
  })

  if (!result.ok) {
    throw new ApiException(
      result.reason === 'invalid_phone' ? 422 : 503,
      result.reason === 'invalid_phone' ? 'INVALID_PHONE' : 'CHANNEL_UNAVAILABLE',
      result.message,
    )
  }

  return ok({ challengeToken: result.challengeToken, maskedPhone: result.maskedPhone })
})
