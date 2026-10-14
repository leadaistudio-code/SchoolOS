import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { recordDayBookExpense } from '@/server/modules/accounting/day-book-service'

/** POST: records and posts an immediately-paid expense. Retry-safe via `idempotencyKey`. */
export const POST = route(
  async (req: NextRequest, ctx) => ok(await recordDayBookExpense(ctx, await req.json()), undefined, { status: 201 }),
  { permission: 'expenses.manage', rateLimitKey: 'mutation' },
)
