import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { approveAssessment, reopenAssessment } from '@/server/modules/assessments/service'

/** Refuses a paper whose questions do not add up to its declared total. */
export const POST = route(
  async (_req: NextRequest, ctx, params) => ok(await approveAssessment(ctx, params.id!)),
  { permission: 'assessments.approve', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req: NextRequest, ctx, params) => {
    await reopenAssessment(ctx, params.id!)
    return ok({ status: 'DRAFT' })
  },
  { permission: 'assessments.approve', rateLimitKey: 'mutation' },
)
