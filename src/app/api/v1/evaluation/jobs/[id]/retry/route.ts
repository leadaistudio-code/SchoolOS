import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { retryEvaluationJob } from '@/server/modules/evaluation/service'

export const POST = route(
  async (_req: NextRequest, ctx, params) => ok(await retryEvaluationJob(ctx, params.id!)),
  { permission: 'assessments.evaluate', rateLimitKey: 'mutation' },
)
