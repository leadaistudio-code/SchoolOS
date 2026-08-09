import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import {
  createHomework,
  homeworkCreateSchema,
  homeworkFilterSchema,
  listHomework,
} from '@/server/modules/homework/service'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const query = parseListQuery(params)
    const filter = homeworkFilterSchema.parse(params)
    const { rows, total } = await listHomework(ctx, query, filter)
    return ok(rows, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'homework.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = homeworkCreateSchema.parse(await req.json())
    return ok(await createHomework(ctx, input), undefined, { status: 201 })
  },
  { permission: 'homework.create', rateLimitKey: 'mutation' },
)
