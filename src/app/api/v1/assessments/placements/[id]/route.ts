import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { placementUpdateSchema, removePlacement, updatePlacement } from '@/server/modules/assessments/service'

export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const input = placementUpdateSchema.parse(await req.json())
    return ok(await updatePlacement(ctx, params.id!, input))
  },
  { permission: 'assessments.edit', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req: NextRequest, ctx, params) => {
    await removePlacement(ctx, params.id!)
    return ok({ removed: true })
  },
  { permission: 'assessments.edit', rateLimitKey: 'mutation' },
)
