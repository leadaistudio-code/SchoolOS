import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { collectAccount } from '@/server/modules/finance/counter'

/** GET — the student and their payable invoices, for the fee counter. */
export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await collectAccount(ctx, params.id!)),
  { permission: 'fees.collect' },
)
