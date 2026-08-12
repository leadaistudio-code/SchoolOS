import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assignmentProgress } from '@/server/modules/assessments/attempts'

/** Who has sat it and who has not. */
export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await assignmentProgress(ctx, params.id!)),
  { permission: 'assessments.view' },
)
