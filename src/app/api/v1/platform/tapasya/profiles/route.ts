import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { moderationList } from '@/server/modules/tapasya/admin'

/** GET /platform/tapasya/profiles?status=&q= — leaderboard profiles with abuse signals, for moderation. */
export const GET = platformRoute(async (req: NextRequest) => {
  const status = req.nextUrl.searchParams.get('status') ?? undefined
  const q = req.nextUrl.searchParams.get('q') ?? undefined
  return ok(await moderationList({ status, q }))
}, { permission: 'platform.tapasya' })
