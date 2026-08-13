import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { reactivateTenant } from '@/server/modules/platform/tenants'

export const POST = platformRoute(
  async (_req, ctx, params) => ok(await reactivateTenant(ctx, params.id!)),
  { permission: 'platform.tenants', rateLimitKey: 'mutation' },
)
