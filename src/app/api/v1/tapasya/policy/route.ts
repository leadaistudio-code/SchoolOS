import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { forbidden, ok } from '@/server/api/response'
import { getGlobalSettings, getSchoolPolicy } from '@/server/modules/tapasya/config'
import { saveSchoolPolicy } from '@/server/modules/tapasya/admin'
import { schoolPolicySchema } from '@/server/modules/tapasya/schema'

/** GET /tapasya/policy — the school's ranges and switches, with the platform bound they sit inside. */
export const GET = route(async (_req, ctx) => {
  if (!ctx.canAny('tapasya.use', 'tapasya.guardian', 'tapasya.teach', 'tapasya.manage')) throw forbidden()
  const [policy, settings] = await Promise.all([getSchoolPolicy(ctx), getGlobalSettings()])
  return ok({ policy, platformLimits: settings.limits, leaderboardEnabled: settings.leaderboardEnabled })
})

export const PUT = route(
  async (req: NextRequest, ctx) => ok(await saveSchoolPolicy(ctx, schoolPolicySchema.parse(await req.json()))),
  { permission: 'tapasya.manage', rateLimitKey: 'mutation' },
)
