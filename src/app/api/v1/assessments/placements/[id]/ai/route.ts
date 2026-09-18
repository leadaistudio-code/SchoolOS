import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  applyPlacementAiAction,
  placementAiActionSchema,
} from '@/server/modules/ai-assessment/placement-actions'

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const input = placementAiActionSchema.parse(await req.json())
    return ok(await applyPlacementAiAction(ctx, params.id!, input))
  },
  { permission: 'assessments.edit', rateLimitKey: 'mutation' },
)
