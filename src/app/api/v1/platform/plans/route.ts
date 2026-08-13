import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createPlan, listPlans } from '@/server/modules/platform/plans'
import { planUpsertSchema } from '@/server/modules/platform/schema'

export const GET = platformRoute(
  async (_req, ctx) => ok(await listPlans(ctx)),
  { permission: 'platform.plans' },
)

export const POST = platformRoute(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const input = planUpsertSchema.parse(body)
    return ok(await createPlan(ctx, input), undefined, { status: 201 })
  },
  { permission: 'platform.plans', rateLimitKey: 'mutation' },
)
