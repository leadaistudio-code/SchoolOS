import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import {
  classworkCreateSchema,
  createClasswork,
  listClasswork,
} from '@/server/modules/academics/content-service'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const query = parseListQuery(params)
    const { rows, total } = await listClasswork(ctx, query, {
      classLevelId: params.classLevelId,
      sectionId: params.sectionId,
      subjectId: params.subjectId,
    })
    return ok(rows, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'classwork.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) =>
    ok(await createClasswork(ctx, classworkCreateSchema.parse(await req.json())), undefined, {
      status: 201,
    }),
  { permission: 'classwork.create', rateLimitKey: 'mutation' },
)
