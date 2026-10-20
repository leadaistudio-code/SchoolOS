import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { forbidden, ok } from '@/server/api/response'
import { getBoard } from '@/server/modules/tapasya/leaderboard'
import { boardQuerySchema } from '@/server/modules/tapasya/schema'

const VIEWERS = ['tapasya.use', 'tapasya.guardian', 'tapasya.teach', 'tapasya.manage']

/** GET /tapasya/leaderboard — the live global board: aliases and XP only. */
export const GET = route(async (req: NextRequest, ctx) => {
  if (!ctx.canAny(...VIEWERS)) throw forbidden()
  const q = boardQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
  return ok(await getBoard({ period: q.period, page: q.page, pageSize: q.pageSize, viewerUserId: ctx.user.userId, division: q.division ?? null }))
})
