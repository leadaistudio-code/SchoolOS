import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { runOverdueScan } from '@/server/modules/platform/billing'

export const POST = platformRoute(
  async (_req, ctx) => ok(await runOverdueScan(ctx)),
  { permission: 'platform.billing', rateLimitKey: 'mutation' },
)
