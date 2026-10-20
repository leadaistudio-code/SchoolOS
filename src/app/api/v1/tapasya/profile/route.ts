import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getOwnProfile, optOutSelf, saveOwnProfile } from '@/server/modules/tapasya/profiles'
import { profileSchema } from '@/server/modules/tapasya/schema'

/** The signed-in student's global leaderboard alias and participation status. */
export const GET = route(async (_req, ctx) => ok(await getOwnProfile(ctx)), { permission: 'tapasya.use' })

export const PUT = route(
  async (req: NextRequest, ctx) => ok(await saveOwnProfile(ctx, profileSchema.parse(await req.json()))),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)

/** DELETE — leave the global board. Public entries are removed at once. */
export const DELETE = route(
  async (_req, ctx) => {
    await optOutSelf(ctx)
    return ok({ optedOut: true })
  },
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
