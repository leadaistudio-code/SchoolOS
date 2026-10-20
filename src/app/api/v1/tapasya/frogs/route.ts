import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { setFrogs } from '@/server/modules/tapasya/tasks'
import { frogSchema } from '@/server/modules/tapasya/schema'

/** PUT /tapasya/frogs — today's frogs and the primary one. */
export const PUT = route(
  async (req: NextRequest, ctx) => ok(await setFrogs(ctx, frogSchema.parse(await req.json()))),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
