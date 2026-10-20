import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { previewScoring, publishScoring, scoringVersions } from '@/server/modules/tapasya/admin'
import { publishScoringSchema, scoringRulesSchema } from '@/server/modules/tapasya/schema'

export const GET = platformRoute(async () => ok(await scoringVersions()), { permission: 'platform.tapasya' })

/**
 * POST /platform/tapasya/scoring?preview=1 — diff and sample XP for proposed rules (nothing saved).
 * POST /platform/tapasya/scoring — publish a new version (prospective, with a reason).
 */
export const POST = platformRoute(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    if (req.nextUrl.searchParams.get('preview') === '1') return ok(await previewScoring(scoringRulesSchema.parse(body.rules ?? body)))
    return ok(await publishScoring(ctx, publishScoringSchema.parse(body)), undefined, { status: 201 })
  },
  { permission: 'platform.tapasya', rateLimitKey: 'mutation' },
)
