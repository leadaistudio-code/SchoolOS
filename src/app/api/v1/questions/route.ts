import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import {
  createQuestion,
  listQuestions,
  questionCreateSchema,
  questionFilterSchema,
} from '@/server/modules/questions/service'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const query = parseListQuery(params)
    const filter = questionFilterSchema.parse(params)
    const { rows, total } = await listQuestions(ctx, query, filter)
    return ok(rows, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'questionbank.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = questionCreateSchema.parse(await req.json())
    return ok(await createQuestion(ctx, input), undefined, { status: 201 })
  },
  { permission: 'questionbank.create', rateLimitKey: 'mutation' },
)
