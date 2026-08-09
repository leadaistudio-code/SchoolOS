import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import { createParent, listParents, parentCreateSchema } from '@/server/modules/people/service'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const query = parseListQuery(req.nextUrl.searchParams)
    const { rows, total } = await listParents(ctx, query)
    return ok(rows, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'parents.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = parentCreateSchema.parse(await req.json())
    return ok(await createParent(ctx, input), undefined, { status: 201 })
  },
  { permission: 'parents.create', rateLimitKey: 'mutation' },
)
