import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { xpLedger, xpSummary } from '@/server/modules/tapasya/dashboard'
import { pageSchema } from '@/server/modules/tapasya/schema'

/** GET /tapasya/xp — the signed-in student's XP summary, achievements and ledger. Read-only: XP is never written by a client. */
export const GET = route(async (req: NextRequest, ctx) => {
  const q = pageSchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
  const [summary, ledger] = await Promise.all([xpSummary(ctx, ctx.user.userId), xpLedger(ctx, ctx.user.userId, q.page, q.pageSize)])
  return ok({ summary, ledger })
}, { permission: 'tapasya.use' })
