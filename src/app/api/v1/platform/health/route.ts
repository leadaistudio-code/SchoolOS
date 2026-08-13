import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getSystemHealth } from '@/server/modules/platform/health'

export const GET = platformRoute(
  async (_req, ctx) => ok(await getSystemHealth(ctx)),
  { permission: 'platform.health' },
)
