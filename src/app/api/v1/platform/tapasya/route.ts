import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { platformOverview, updateGlobalSettings } from '@/server/modules/tapasya/admin'
import { globalSettingsSchema } from '@/server/modules/tapasya/schema'

/** GET /platform/tapasya — aggregate metrics, current rules and settings. No student identities. */
export const GET = platformRoute(async () => ok(await platformOverview()), { permission: 'platform.tapasya' })

/** PUT /platform/tapasya — leaderboard switches, timezone and platform Pomodoro limits. */
export const PUT = platformRoute(
  async (req: NextRequest, ctx) => ok(await updateGlobalSettings(ctx, globalSettingsSchema.parse(await req.json()))),
  { permission: 'platform.tapasya', rateLimitKey: 'mutation' },
)
