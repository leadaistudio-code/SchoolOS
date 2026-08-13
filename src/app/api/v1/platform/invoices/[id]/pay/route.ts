import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { markInvoicePaid, voidInvoice } from '@/server/modules/platform/billing'

export const POST = platformRoute(
  async (_req, ctx, params) => ok(await markInvoicePaid(ctx, params.id!)),
  { permission: 'platform.billing', rateLimitKey: 'mutation' },
)
