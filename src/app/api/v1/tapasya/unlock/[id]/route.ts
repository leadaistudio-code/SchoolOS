import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { cancelUnlock, redeemCode } from '@/server/modules/tapasya/unlock'
import { unlockCodeSchema } from '@/server/modules/tapasya/schema'

/** POST /tapasya/unlock/{id} — enter the code a guardian shared. */
export const POST = route(
  async (req: NextRequest, ctx, params) => ok(await redeemCode(ctx, params.id!, unlockCodeSchema.parse(await req.json()).code)),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)

/** DELETE /tapasya/unlock/{id} — withdraw the request. */
export const DELETE = route(
  async (_req, ctx, params) => ok(await cancelUnlock(ctx, params.id!)),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
