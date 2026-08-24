import { route } from '@/server/api/handler'
import { getTeacherRefreshConfig, updateTeacherRefreshConfig } from '@/server/modules/teacher-refresh/config.service'
import { updateTeacherRefreshConfigSchema } from '@/server/modules/teacher-refresh/schema'
import { ok } from '@/server/api/response'

export const GET = route(
  async (_req, ctx) => {
    const config = await getTeacherRefreshConfig(ctx)
    return ok(config)
  },
  { permission: 'settings.manage' }
)

export const PUT = route(
  async (req, ctx) => {
    const body = await req.json()
    const input = updateTeacherRefreshConfigSchema.parse(body)
    const config = await updateTeacherRefreshConfig(ctx, input)
    return ok(config)
  },
  { permission: 'settings.manage', rateLimitKey: 'mutation' }
)
