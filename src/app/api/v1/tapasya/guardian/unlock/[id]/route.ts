import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { guardianDecideUnlock } from '@/server/modules/tapasya/unlock'
import { unlockDecisionSchema } from '@/server/modules/tapasya/schema'

/** POST /tapasya/guardian/unlock/{id} — approve or decline a child's exception request. */
export const POST = route(
  async (req: NextRequest, ctx, params) => ok(await guardianDecideUnlock(ctx, params.id!, unlockDecisionSchema.parse(await req.json()))),
  { permission: 'tapasya.guardian', rateLimitKey: 'mutation' },
)
