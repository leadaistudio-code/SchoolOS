import { route } from '@/server/api/handler'
import { exemptRefresher } from '@/server/modules/teacher-refresh/service'
import { exemptRefresherSchema } from '@/server/modules/teacher-refresh/schema'
import { ok } from '@/server/api/response'

/** Principal / admin: exempt a teacher from a refresher, with a reason on record. */
export const POST = route(
  async (req, ctx, params) => {
    const body = await req.json()
    const input = exemptRefresherSchema.parse(body)
    const result = await exemptRefresher(ctx, params.id!, input.reason)
    return ok(result)
  },
  { permission: 'teacher_refresh.manage', rateLimitKey: 'mutation' },
)
