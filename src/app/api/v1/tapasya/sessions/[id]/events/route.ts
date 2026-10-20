import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ApiException, ok } from '@/server/api/response'
import { applySessionEvents } from '@/server/modules/tapasya/sessions'
import { sessionEventsSchema } from '@/server/modules/tapasya/schema'

/**
 * POST /tapasya/sessions/{id}/events — pause, resume, break, finish, … in order.
 * A single rejected event is an error; in a batch, each event reports its own result.
 */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const { events } = sessionEventsSchema.parse(await req.json())
    const out = await applySessionEvents(ctx, params.id!, events)
    const only = out.results[0]
    if (events.length === 1 && only && !only.ok) throw new ApiException(409, only.code ?? 'INVALID_TRANSITION', only.message ?? 'That action is not possible now.')
    return ok(out)
  },
  { permission: 'tapasya.use' },
)
