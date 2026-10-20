import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { currentStudent } from '@/server/modules/tapasya/people'
import { createOwnTask, listTasks } from '@/server/modules/tapasya/tasks'
import { taskInputSchema } from '@/server/modules/tapasya/schema'

export const GET = route(async (req: NextRequest, ctx) => {
  const student = await currentStudent(ctx)
  const scope = req.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'open'
  return ok(await listTasks(ctx, student.id, scope))
}, { permission: 'tapasya.use' })

export const POST = route(
  async (req: NextRequest, ctx) => ok(await createOwnTask(ctx, taskInputSchema.parse(await req.json())), undefined, { status: 201 }),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
