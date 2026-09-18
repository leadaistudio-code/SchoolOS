import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { runPaperQualityCheck } from '@/server/modules/ai-assessment/quality'

export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await runPaperQualityCheck(ctx, params.id!)),
  { permission: 'assessments.view' },
)
