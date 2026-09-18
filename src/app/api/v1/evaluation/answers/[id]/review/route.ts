import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { reviewAnswerSchema, reviewEvaluatedAnswer } from '@/server/modules/evaluation/service'

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const input = reviewAnswerSchema.parse(await req.json())
    return ok(await reviewEvaluatedAnswer(ctx, params.id!, input))
  },
  { permission: 'assessments.evaluate', rateLimitKey: 'mutation' },
)
