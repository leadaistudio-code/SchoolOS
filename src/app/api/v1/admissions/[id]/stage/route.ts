import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { moveLeadStage } from '@/server/modules/admissions/service'
import { leadStageSchema } from '@/server/modules/admissions/schema'

/**
 * POST /api/v1/admissions/:id/stage — move an enquiry along the pipeline.
 *
 * The one write a counsellor needs on a phone: they have just come off a call
 * and the stage is now different. Everything the web action does — the history
 * entry, the lost reason, the ordering — happens inside `moveLeadStage`.
 */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const input = leadStageSchema.parse(await req.json())
    return ok(await moveLeadStage(ctx, params.id!, input))
  },
  { permission: 'admissions.manage', rateLimitKey: 'mutation' },
)
