import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { tripSchema } from '@/server/modules/transport/service'
import { driverToday, endTrip, startTrip } from '@/server/modules/transport/tracking'

export const GET = route(async (_req: NextRequest, ctx) => ok(await driverToday(ctx)), {
  permission: 'transport.drive',
})

export const POST = route(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    if (body?.action === 'end') return ok(await endTrip(ctx, String(body.tripId)))
    return ok(await startTrip(ctx, tripSchema.parse(body)), undefined, { status: 201 })
  },
  { permission: 'transport.drive', rateLimitKey: 'mutation' },
)
