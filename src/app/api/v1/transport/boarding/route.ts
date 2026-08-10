import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { boardingSchema } from '@/server/modules/transport/service'
import { recordBoarding } from '@/server/modules/transport/tracking'

/** The driver marking a child on or off the bus; guardians are told either way. */
export const POST = route(
  async (req: NextRequest, ctx) =>
    ok(await recordBoarding(ctx, boardingSchema.parse(await req.json())), undefined, { status: 201 }),
  { permission: 'transport.drive', rateLimitKey: 'mutation' },
)
