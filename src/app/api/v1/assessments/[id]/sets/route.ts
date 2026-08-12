import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { generateAlternateSet } from '@/server/modules/assessments/service'

/** Set B, C, … from this paper: same structure, different questions where
  * the bank can supply them. */
export const POST = route(
  async (_req: NextRequest, ctx, params) =>
    ok(await generateAlternateSet(ctx, params.id!), undefined, { status: 201 }),
  { permission: 'assessments.create', rateLimitKey: 'mutation' },
)
