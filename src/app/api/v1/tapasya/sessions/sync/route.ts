import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { syncOfflineSession } from '@/server/modules/tapasya/sessions'
import { syncSessionSchema } from '@/server/modules/tapasya/schema'

/** POST /tapasya/sessions/sync — upload a session that ran offline. Its XP stays pending until validated. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const { start, events } = syncSessionSchema.parse(await req.json())
    return ok(await syncOfflineSession(ctx, start, events))
  },
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
