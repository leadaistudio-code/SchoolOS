import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createSeason, listSeasons } from '@/server/modules/tapasya/admin'
import { seasonSchema } from '@/server/modules/tapasya/schema'

export const GET = platformRoute(async () => ok(await listSeasons()), { permission: 'platform.tapasya' })

export const POST = platformRoute(
  async (req: NextRequest, ctx) => ok(await createSeason(ctx, seasonSchema.parse(await req.json())), undefined, { status: 201 }),
  { permission: 'platform.tapasya', rateLimitKey: 'mutation' },
)
