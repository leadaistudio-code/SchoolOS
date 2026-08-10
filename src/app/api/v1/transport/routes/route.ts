import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import { listRoutes, routeSchema, saveRoute } from '@/server/modules/transport/service'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const query = parseListQuery(req.nextUrl.searchParams)
    const { rows, total } = await listRoutes(ctx, query)
    return ok(rows, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'transport.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => ok(await saveRoute(ctx, routeSchema.parse(await req.json())), undefined, { status: 201 }),
  { permission: 'transport.manage', rateLimitKey: 'mutation' },
)
