import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getInvoice } from '@/server/modules/finance/service'

export const GET = route(async (_req, ctx, params) => ok(await getInvoice(ctx, params.id!)), {
  permission: 'fees.view',
})
