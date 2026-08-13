import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getPlatformTicket, replyPlatformTicket, updatePlatformTicket } from '@/server/modules/platform/support'
import { supportMessageSchema, supportTicketUpdateSchema } from '@/server/modules/platform/schema'

export const GET = platformRoute(
  async (_req, ctx, params) => ok(await getPlatformTicket(ctx, params.id!)),
  { permission: 'platform.support' },
)

export const PATCH = platformRoute(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = supportTicketUpdateSchema.parse(body)
    return ok(await updatePlatformTicket(ctx, params.id!, input))
  },
  { permission: 'platform.support', rateLimitKey: 'mutation' },
)
