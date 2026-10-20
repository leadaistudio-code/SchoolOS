import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { moderateProfile, profileLedger, reverseXp } from '@/server/modules/tapasya/admin'
import { moderateSchema, reverseXpSchema } from '@/server/modules/tapasya/schema'

/** GET /platform/tapasya/profiles/{id} — the profile's recent XP ledger. */
export const GET = platformRoute(async (_req, _ctx, params) => ok(await profileLedger(params.id!)), { permission: 'platform.tapasya' })

/** PATCH — suspend or restore. */
export const PATCH = platformRoute(
  async (req: NextRequest, ctx, params) => {
    const input = moderateSchema.parse(await req.json())
    await moderateProfile(ctx, params.id!, input.action, input.reason)
    return ok({ done: true })
  },
  { permission: 'platform.tapasya', rateLimitKey: 'mutation' },
)

/** POST — reverse one XP award with an audited correction row. */
export const POST = platformRoute(
  async (req: NextRequest, ctx, params) => {
    const input = reverseXpSchema.parse(await req.json())
    await reverseXp(ctx, params.id!, input.xpEventId, input.reason)
    return ok({ reversed: true })
  },
  { permission: 'platform.tapasya', rateLimitKey: 'mutation' },
)
