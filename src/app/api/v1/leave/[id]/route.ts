import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { cancelLeave, decideLeave, leaveDecisionSchema } from '@/server/modules/leave/service'

/** PATCH — approve or reject. Self-approval is refused by the service. */
export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const input = leaveDecisionSchema.parse(await req.json())
    return ok(await decideLeave(ctx, params.id!, input))
  },
  { permission: 'leave.approve', rateLimitKey: 'mutation' },
)

/** DELETE — the applicant withdraws a pending request. */
export const DELETE = route(
  async (_req: NextRequest, ctx, params) => ok(await cancelLeave(ctx, params.id!)),
  { permission: 'leave.apply', rateLimitKey: 'mutation' },
)
