import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { deleteOutcome } from '@/server/modules/curriculum/service'

export const DELETE = route(
  async (_req: NextRequest, ctx, params) => {
    await deleteOutcome(ctx, params.id!)
    return ok({ deleted: true })
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)
