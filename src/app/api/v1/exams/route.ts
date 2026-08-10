import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import { createExam, examCreateSchema, listExams } from '@/server/modules/exams/service'
import { parseListQuery } from '@/lib/query'

export const GET = route(async (req: NextRequest, ctx) => {
  const query = parseListQuery(req.nextUrl.searchParams)
  const { rows, total } = await listExams(ctx, query)
  return ok(rows, paginationMeta(query.page, query.pageSize, total))
}, { permission: 'exams.view' })

export const POST = route(async (req: NextRequest, ctx) =>
  ok(await createExam(ctx, examCreateSchema.parse(await req.json())), undefined, { status: 201 }),
{ permission: 'exams.manage', rateLimitKey: 'mutation' })
