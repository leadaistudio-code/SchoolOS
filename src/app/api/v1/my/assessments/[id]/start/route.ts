import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { startAttempt } from '@/server/modules/assessments/attempts'

/** Opens or resumes an attempt and returns the paper without its answers. */
export const POST = route(
  async (_req: NextRequest, ctx, params) => ok(await startAttempt(ctx, params.id!)),
  { permission: 'assessments.attempt', rateLimitKey: 'mutation' },
)
