import type { NextRequest } from 'next/server'
import { supportRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  createTenantTicket,
  getTenantTicket,
  listTenantTickets,
  replyTenantTicket,
} from '@/server/modules/platform/support'
import { supportMessageSchema, supportTicketCreateSchema } from '@/server/modules/platform/schema'

export const GET = supportRoute(
  async (_req, ctx) => ok(await listTenantTickets(ctx)),
  { permission: 'support.view' },
)

export const POST = supportRoute(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const input = supportTicketCreateSchema.parse(body)
    return ok(await createTenantTicket(ctx, input), undefined, { status: 201 })
  },
  { permission: 'support.create', rateLimitKey: 'mutation' },
)
