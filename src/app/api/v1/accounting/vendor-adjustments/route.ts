import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createVendorAdjustment } from '@/server/modules/accounting/payables-service'

/** Discounts and write-offs: separate, auditable transactions, never folded into debit notes. */
export const POST = route(
  async (req: NextRequest, ctx) => ok(await createVendorAdjustment(ctx, await req.json()), undefined, { status: 201 }),
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
