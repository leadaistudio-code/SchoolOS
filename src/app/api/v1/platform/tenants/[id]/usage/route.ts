import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getTenantUsage } from '@/server/modules/platform/usage'

export const GET = platformRoute(
  async (_req, ctx, params) => ok(await getTenantUsage(ctx, params.id)),
  { permission: 'platform.tenants' },
)
