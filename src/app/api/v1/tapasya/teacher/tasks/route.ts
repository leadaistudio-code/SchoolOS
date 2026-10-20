import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assignTasks, teacherAssignedTasks } from '@/server/modules/tapasya/tasks'
import { teacherTaskSchema } from '@/server/modules/tapasya/schema'

export const GET = route(async (_req, ctx) => ok(await teacherAssignedTasks(ctx)), { permission: 'tapasya.teach' })

/** POST /tapasya/teacher/tasks — assign a study task to students in your classes. */
export const POST = route(
  async (req: NextRequest, ctx) => ok(await assignTasks(ctx, teacherTaskSchema.parse(await req.json())), undefined, { status: 201 }),
  { permission: 'tapasya.teach', rateLimitKey: 'mutation' },
)
