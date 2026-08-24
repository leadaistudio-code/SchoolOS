import { route } from '@/server/api/handler'
import { composeForCurrentTeacher } from '@/server/modules/teacher-refresh/service'
import { composeRefresherSchema } from '@/server/modules/teacher-refresh/schema'
import { ok } from '@/server/api/response'

/** On-demand refresher: "Before You Teach" (pre-lecture) and manual brush-ups. */
export const POST = route(
  async (req, ctx) => {
    const body = await req.json()
    const input = composeRefresherSchema.parse(body)
    const result = await composeForCurrentTeacher(ctx, input)
    return ok(result)
  },
  { permission: 'teacher_refresh.take', rateLimitKey: 'mutation' },
)
