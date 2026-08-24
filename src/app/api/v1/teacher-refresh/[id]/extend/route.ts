import { route } from '@/server/api/handler'
import { extendRefresher } from '@/server/modules/teacher-refresh/service'
import { extendRefresherSchema } from '@/server/modules/teacher-refresh/schema'
import { ok } from '@/server/api/response'

/** Principal / admin: extend the completion window on a refresher. */
export const POST = route(
  async (req, ctx, params) => {
    const body = await req.json()
    const input = extendRefresherSchema.parse(body)
    const result = await extendRefresher(ctx, params.id!, input.hours)
    return ok(result)
  },
  { permission: 'teacher_refresh.manage', rateLimitKey: 'mutation' },
)
