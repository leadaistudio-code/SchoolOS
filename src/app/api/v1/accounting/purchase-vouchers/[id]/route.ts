import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { cancelPurchaseVoucher, postPurchaseVoucher } from '@/server/modules/accounting/payables-service'

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('post') }),
  z.object({ action: z.literal('cancel'), reason: z.string().trim().min(3).max(1000) }),
])

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = actionSchema.parse(await req.json())
    return ok(
      body.action === 'post'
        ? await postPurchaseVoucher(ctx, params.id!)
        : await cancelPurchaseVoucher(ctx, params.id!, body.reason),
    )
  },
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
