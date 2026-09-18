import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { leaveTypes } from '@/server/modules/leave/service'

/** GET /api/v1/leave/types?appliesTo=STAFF|STUDENT */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const appliesTo = req.nextUrl.searchParams.get('appliesTo') === 'STUDENT' ? 'STUDENT' : 'STAFF'
    return ok(await leaveTypes(ctx, appliesTo))
  },
  { permission: 'leave.apply' },
)
