import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { setPlanEntitlements } from '@/server/modules/platform/plans'
import { planEntitlementSchema } from '@/server/modules/platform/schema'
import { z } from 'zod'

export const POST = platformRoute(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const entitlements = z.array(planEntitlementSchema).parse(body.entitlements ?? body)
    return ok(await setPlanEntitlements(ctx, params.id, entitlements))
  },
  { permission: 'platform.plans', rateLimitKey: 'mutation' },
)
