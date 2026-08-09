import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import { applyForLeave, listLeave, leaveApplySchema, leaveListFilterSchema } from '@/server/modules/leave/service'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const query = parseListQuery(params)
    const filter = leaveListFilterSchema.parse(params)
    const { rows, total } = await listLeave(ctx, query, filter)
    return ok(rows, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'leave.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = leaveApplySchema.parse(await req.json())
    return ok(await applyForLeave(ctx, input), undefined, { status: 201 })
  },
  { permission: 'leave.apply', rateLimitKey: 'mutation' },
)
