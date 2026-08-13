import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { archiveTenant } from '@/server/modules/platform/tenants'

export const POST = platformRoute(
  async (_req, ctx, params) => ok(await archiveTenant(ctx, params.id!)),
  { permission: 'platform.tenants', rateLimitKey: 'mutation' },
)
