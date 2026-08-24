import { route } from '@/server/api/handler'
import { submitMyRefresher } from '@/server/modules/teacher-refresh/service'
import { submitRefresherSchema } from '@/server/modules/teacher-refresh/schema'
import { ok } from '@/server/api/response'

export const POST = route(
  async (req, ctx, params) => {
    const body = await req.json()
    const input = submitRefresherSchema.parse(body)
    const result = await submitMyRefresher(ctx, params.id!, input)
    return ok(result)
  },
  { permission: 'teacher_refresh.take', rateLimitKey: 'mutation' },
)
