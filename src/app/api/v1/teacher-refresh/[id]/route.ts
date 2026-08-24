import { route } from '@/server/api/handler'
import { getMyRefresherForTaking } from '@/server/modules/teacher-refresh/service'
import { ok } from '@/server/api/response'

/** One refresher, prepared for taking (no answer keys leaked pre-submit). */
export const GET = route(
  async (_req, ctx, params) => {
    const data = await getMyRefresherForTaking(ctx, params.id!)
    return ok(data)
  },
  { permission: 'teacher_refresh.take' },
)
