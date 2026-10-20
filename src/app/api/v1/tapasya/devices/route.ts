import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { devicesFor, reportDevice } from '@/server/modules/tapasya/dashboard'
import { deviceReportSchema } from '@/server/modules/tapasya/schema'

export const GET = route(async (_req, ctx) => ok(await devicesFor(ctx, ctx.user.userId)), { permission: 'tapasya.use' })

/** POST /tapasya/devices — what this phone's OS confirmed it can do. Informational; never affects XP. */
export const POST = route(
  async (req: NextRequest, ctx) => ok(await reportDevice(ctx, deviceReportSchema.parse(await req.json()))),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
