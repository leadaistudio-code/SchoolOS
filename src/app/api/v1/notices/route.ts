import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import { createNotice, listNotices, noticeCreateSchema } from '@/server/modules/notices/service'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const query = parseListQuery(params)
    const { rows, total } = await listNotices(ctx, query, { priority: params.priority })
    return ok(rows, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'notices.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) =>
    ok(await createNotice(ctx, noticeCreateSchema.parse(await req.json())), undefined, {
      status: 201,
    }),
  { permission: 'notices.create', rateLimitKey: 'mutation' },
)
