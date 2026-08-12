import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assignmentAnalytics } from '@/server/modules/assessments/evaluation'

export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await assignmentAnalytics(ctx, params.id!)),
  { permission: 'assessments.view' },
)
