import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { guardianDecide } from '@/server/modules/tapasya/profiles'
import { guardianConsentSchema } from '@/server/modules/tapasya/schema'

/** POST /tapasya/guardian/consent — approve, decline or withdraw a child's global participation. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = guardianConsentSchema.parse(await req.json())
    return ok(await guardianDecide(ctx, input.studentId, input.decision))
  },
  { permission: 'tapasya.guardian', rateLimitKey: 'mutation' },
)
