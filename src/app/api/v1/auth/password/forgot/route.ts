import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { requestPasswordReset } from '@/server/auth/reset'
import { resolveTenant } from '@/server/tenant'

const schema = z.object({
  email: z.string().trim().email(),
})

/**
 * POST /api/v1/auth/password/forgot
 *
 * The same service the web form uses, for native clients. Like the form it
 * always reports success — an app must not be able to enumerate a school's
 * families any more than a browser can. The tenant comes from the request
 * host, so the link is issued for the school the client is pointed at.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const tenant = await resolveTenant()
  if (!tenant) {
    throw new ApiException(400, 'NO_TENANT', 'Connect to your school address first')
  }

  const body = schema.parse(await req.json())
  const result = await requestPasswordReset(body.email, {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.school?.name ?? tenant.name,
  })

  return ok({ requested: true, message: result.message })
})
