import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import { assertTeachable } from '@/server/modules/tapasya/people'
import { sessionHistory } from '@/server/modules/tapasya/sessions'
import { listTasks } from '@/server/modules/tapasya/tasks'
import { pageSchema } from '@/server/modules/tapasya/schema'

/** GET /tapasya/teacher/students/{id} — one student's tasks and session history. */
export const GET = route(async (req: NextRequest, ctx, params) => {
  await assertTeachable(ctx, params.id!)
  const q = pageSchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
  const [tasks, history] = await Promise.all([listTasks(ctx, params.id!, 'all'), sessionHistory(ctx, params.id!, q.page, q.pageSize)])
  return ok({ tasks, sessions: history.items }, paginationMeta(q.page, q.pageSize, history.total))
}, { permission: 'tapasya.teach' })
