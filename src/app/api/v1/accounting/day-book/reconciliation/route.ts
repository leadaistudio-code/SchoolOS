import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getDayBookReconciliation } from '@/server/modules/accounting/day-book-service'

export const GET = route(
  async (req: NextRequest, ctx) => ok(await getDayBookReconciliation(ctx, Object.fromEntries(req.nextUrl.searchParams))),
  { permission: 'accounts.view' },
)
