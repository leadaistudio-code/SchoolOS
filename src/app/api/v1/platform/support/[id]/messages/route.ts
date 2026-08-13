import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { replyPlatformTicket } from '@/server/modules/platform/support'
import { supportMessageSchema } from '@/server/modules/platform/schema'

export const POST = platformRoute(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = supportMessageSchema.parse(body)
    return ok(await replyPlatformTicket(ctx, params.id, input), undefined, { status: 201 })
  },
  { permission: 'platform.support', rateLimitKey: 'mutation' },
)
