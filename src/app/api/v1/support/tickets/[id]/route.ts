import { supportRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getTenantTicket } from '@/server/modules/platform/support'

export const GET = supportRoute(
  async (_req, ctx, params) => ok(await getTenantTicket(ctx, params.id!)),
  { permission: 'support.view' },
)
