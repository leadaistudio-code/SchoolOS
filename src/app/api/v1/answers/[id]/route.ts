import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { markAnswer, markSchema } from '@/server/modules/assessments/evaluation'

export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const input = markSchema.parse(await req.json())
    return ok(await markAnswer(ctx, params.id!, input))
  },
  { permission: 'assessments.evaluate', rateLimitKey: 'mutation' },
)
