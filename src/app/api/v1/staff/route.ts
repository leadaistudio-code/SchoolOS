import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import { createStaff, listStaff, staffCreateSchema } from '@/server/modules/people/service'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const query = parseListQuery(req.nextUrl.searchParams)
    const staffType = req.nextUrl.searchParams.get('staffType') ?? undefined
    const { rows, total } = await listStaff(ctx, query, { staffType })
    return ok(rows, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'staff.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = staffCreateSchema.parse(await req.json())
    return ok(await createStaff(ctx, input), undefined, { status: 201 })
  },
  { permission: 'staff.create', rateLimitKey: 'mutation' },
)
