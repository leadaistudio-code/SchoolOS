import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import {
  assessmentCreateSchema,
  assessmentFilterSchema,
  createAssessment,
  listAssessments,
} from '@/server/modules/assessments/service'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const query = parseListQuery(params)
    const filter = assessmentFilterSchema.parse(params)
    const { rows, total } = await listAssessments(ctx, query, filter)
    return ok(rows, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'assessments.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = assessmentCreateSchema.parse(await req.json())
    return ok(await createAssessment(ctx, input), undefined, { status: 201 })
  },
  { permission: 'assessments.create', rateLimitKey: 'mutation' },
)
