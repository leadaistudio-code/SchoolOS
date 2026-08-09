import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import {
  listPayments,
  paymentFilterSchema,
  refundPayment,
  refundSchema,
  startOnlinePayment,
  startPaymentSchema,
} from '@/server/modules/finance/payments'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const query = parseListQuery(params)
    const filter = paymentFilterSchema.parse(params)
    const { rows, total, collectedMinor } = await listPayments(ctx, query, filter)
    return ok(
      { payments: rows, collectedMinor },
      paginationMeta(query.page, query.pageSize, total),
    )
  },
  { permission: 'fees.view' },
)

/**
 * POST — opens an online payment. This does NOT move money: it creates an
 * INITIATED record and returns a checkout URL. Settlement happens only after
 * the gateway is verified server-side.
 */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = startPaymentSchema.parse(await req.json())
    return ok(await startOnlinePayment(ctx, input), undefined, { status: 201 })
  },
  { permission: 'fees.view', rateLimitKey: 'mutation' },
)

/** PATCH — issue a refund against a settled payment. */
export const PATCH = route(
  async (req: NextRequest, ctx) => {
    const input = refundSchema.parse(await req.json())
    return ok(await refundPayment(ctx, input))
  },
  { permission: 'fees.refund', rateLimitKey: 'mutation' },
)
