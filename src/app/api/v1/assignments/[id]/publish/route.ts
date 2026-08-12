import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { publishResults } from '@/server/modules/assessments/evaluation'

/** Releases every marked paper in this assignment at once. */
export const POST = route(
  async (_req: NextRequest, ctx, params) => ok(await publishResults(ctx, params.id!)),
  { permission: 'assessments.publish', rateLimitKey: 'mutation' },
)
