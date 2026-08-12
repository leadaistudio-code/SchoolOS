import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { attemptPaper } from '@/server/modules/assessments/attempts'

export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await attemptPaper(ctx, params.id!)),
  { permission: 'assessments.attempt' },
)
