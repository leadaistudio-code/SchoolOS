import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { ownUnlocks, requestUnlock } from '@/server/modules/tapasya/unlock'
import { unlockRequestSchema } from '@/server/modules/tapasya/schema'

export const GET = route(async (_req, ctx) => ok(await ownUnlocks(ctx)), { permission: 'tapasya.use' })

/** POST /tapasya/unlock — ask a guardian for a temporary exception. */
export const POST = route(
  async (req: NextRequest, ctx) => ok(await requestUnlock(ctx, unlockRequestSchema.parse(await req.json())), undefined, { status: 201 }),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
