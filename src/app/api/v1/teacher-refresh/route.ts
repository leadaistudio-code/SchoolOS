import { route } from '@/server/api/handler'
import { listMyRefreshers } from '@/server/modules/teacher-refresh/service'
import { ok } from '@/server/api/response'

/** The signed-in teacher's own refreshers, grouped due / overdue / completed. */
export const GET = route(
  async (_req, ctx) => {
    const data = await listMyRefreshers(ctx)
    return ok(data)
  },
  { permission: 'teacher_refresh.view_self' },
)
