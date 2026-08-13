import type { NextRequest } from 'next/server'
import { supportRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { replyTenantTicket } from '@/server/modules/platform/support'
import { supportMessageSchema } from '@/server/modules/platform/schema'

export const POST = supportRoute(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = supportMessageSchema.parse(body)
    return ok(await replyTenantTicket(ctx, params.id, input), undefined, { status: 201 })
  },
  { permission: 'support.create', rateLimitKey: 'mutation' },
)
