import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getEvaluationJob } from '@/server/modules/evaluation/service'

export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await getEvaluationJob(ctx, params.id!)),
  { permission: 'assessments.evaluate' },
)
