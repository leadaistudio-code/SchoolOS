import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { attemptForMarking } from '@/server/modules/assessments/evaluation'

/** The marker's view: the answer beside the marking scheme. */
export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await attemptForMarking(ctx, params.id!)),
  { permission: 'assessments.evaluate' },
)
