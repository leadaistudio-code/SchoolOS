import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { deletePlan, getPlan, setPlanEntitlements, updatePlan } from '@/server/modules/platform/plans'
import { planEntitlementSchema, planUpsertSchema } from '@/server/modules/platform/schema'
import { z } from 'zod'

export const GET = platformRoute(
  async (_req, ctx, params) => ok(await getPlan(ctx, params.id)),
  { permission: 'platform.plans' },
)

export const PATCH = platformRoute(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = planUpsertSchema.partial().parse(body)
    return ok(await updatePlan(ctx, params.id, input))
  },
  { permission: 'platform.plans', rateLimitKey: 'mutation' },
)

export const DELETE = platformRoute(
  async (_req, ctx, params) => {
    await deletePlan(ctx, params.id)
    return ok({ deleted: true })
  },
  { permission: 'platform.plans', rateLimitKey: 'mutation' },
)
