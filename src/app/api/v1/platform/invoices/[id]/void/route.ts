import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { voidInvoice } from '@/server/modules/platform/billing'

export const POST = platformRoute(
  async (_req, ctx, params) => ok(await voidInvoice(ctx, params.id)),
  { permission: 'platform.billing', rateLimitKey: 'mutation' },
)
