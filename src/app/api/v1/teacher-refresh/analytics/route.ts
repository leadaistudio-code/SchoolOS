import { route } from '@/server/api/handler'
import { facultyReadinessOverview } from '@/server/modules/teacher-refresh/analytics'
import { ok } from '@/server/api/response'

/**
 * School-wide faculty readiness for oversight roles. Internal professional-
 * development data — gated behind `teacher_refresh.view_school`, never exposed
 * to parents or students.
 */
export const GET = route(
  async (_req, ctx) => {
    const data = await facultyReadinessOverview(ctx)
    return ok(data)
  },
  { permission: 'teacher_refresh.view_school' },
)
