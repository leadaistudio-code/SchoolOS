import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { findSimilar, similarSchema } from '@/server/modules/questions/service'

/** Checked before a question is saved, so a repeat is caught while it can
  * still be changed rather than after it reaches a paper. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = similarSchema.parse(await req.json())
    return ok(await findSimilar(ctx, input))
  },
  { permission: 'questionbank.view', rateLimitKey: 'mutation' },
)
