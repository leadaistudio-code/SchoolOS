import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { pingSchema } from '@/server/modules/transport/service'
import { recordPing } from '@/server/modules/transport/tracking'

/**
 * GPS ingestion from the driver device.
 *
 * The busiest write path in the product, so it does one insert and answers.
 * The rate limit is the mutation bucket rather than a bespoke one: a device
 * pinging every few seconds sits comfortably inside 60/minute, and anything
 * faster than that is a broken client, not a more accurate map.
 */
export const POST = route(
  async (req: NextRequest, ctx) => ok(await recordPing(ctx, pingSchema.parse(await req.json())), undefined, { status: 201 }),
  { permission: 'transport.drive', rateLimitKey: 'mutation' },
)
