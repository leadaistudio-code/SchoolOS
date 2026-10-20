import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { withdrawTeacherTask } from '@/server/modules/tapasya/tasks'

/** DELETE /tapasya/teacher/tasks/{id} — withdraw (cancel) a task you set. */
export const DELETE = route(
  async (_req, ctx, params) => {
    await withdrawTeacherTask(ctx, params.id!)
    return ok({ withdrawn: true })
  },
  { permission: 'tapasya.teach', rateLimitKey: 'mutation' },
)
