import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { collectPayment, collectSchema } from '@/server/modules/finance/payments'

/** POST — records a payment taken at the counter and issues a receipt. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = collectSchema.parse(await req.json())
    return ok(await collectPayment(ctx, input), undefined, { status: 201 })
  },
  { permission: 'fees.collect', rateLimitKey: 'mutation' },
)
