import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { myResult } from '@/server/modules/assessments/evaluation'

/** A student's own marked paper. Refuses before the result is released. */
export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await myResult(ctx, params.id!)),
  { permission: 'assessments.attempt' },
)
