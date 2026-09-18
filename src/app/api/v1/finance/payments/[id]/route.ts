import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import { getReceipt } from '@/server/modules/finance/payments'

/** GET /api/v1/finance/payments/:id — receipt detail for counter / share. */
export const GET = route(
  async (_req: NextRequest, ctx, params) => {
    if (!params.id) throw badRequest('Payment id is required')
    return ok(await getReceipt(ctx, params.id))
  },
  { permission: 'fees.view' },
)
