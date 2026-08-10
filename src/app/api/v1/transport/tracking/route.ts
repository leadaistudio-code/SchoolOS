import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { trackingSnapshot } from '@/server/modules/transport/tracking'

/**
 * The live map's polling endpoint.
 *
 * Returns the whole picture rather than a delta: the client may have been
 * asleep in a background tab for ten minutes, and reconstructing state from
 * missed deltas is how a parent ends up looking at a bus that is no longer
 * there. Scoping to a parent's own children happens in the service, not here.
 */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const busId = req.nextUrl.searchParams.get('busId') ?? undefined
    return ok(await trackingSnapshot(ctx, { busId }))
  },
  { permission: 'transport.track' },
)
