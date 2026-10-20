import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import { currentStudent } from '@/server/modules/tapasya/people'
import { sessionHistory, startSession } from '@/server/modules/tapasya/sessions'
import { pageSchema, startSessionSchema } from '@/server/modules/tapasya/schema'

export const GET = route(async (req: NextRequest, ctx) => {
  const student = await currentStudent(ctx)
  const q = pageSchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
  const { items, total } = await sessionHistory(ctx, student.id, q.page, q.pageSize)
  return ok(items, paginationMeta(q.page, q.pageSize, total))
}, { permission: 'tapasya.use' })

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = startSessionSchema.parse(await req.json())
    if (input.clientStartedAt) input.clientStartedAt = undefined
    return ok(await startSession(ctx, input), undefined, { status: 201 })
  },
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
