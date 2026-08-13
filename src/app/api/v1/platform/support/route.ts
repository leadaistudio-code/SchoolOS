import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { listPlatformTickets } from '@/server/modules/platform/support'
import { listSupportTicketsSchema } from '@/server/modules/platform/schema'

export const GET = platformRoute(
  async (req: NextRequest, ctx) => {
    const query = listSupportTicketsSchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await listPlatformTickets(ctx, query)
    return ok(result.rows, result.meta)
  },
  { permission: 'platform.support' },
)
