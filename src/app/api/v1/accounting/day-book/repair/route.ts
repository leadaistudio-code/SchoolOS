import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { repairExpensePostings } from '@/server/modules/accounting/day-book-service'

/** POST { from, to }: re-posts expenses in the range whose journal entry is missing or stale. */
export const POST = route(
  async (req: NextRequest, ctx) => ok(await repairExpensePostings(ctx, await req.json().catch(() => ({})))),
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
