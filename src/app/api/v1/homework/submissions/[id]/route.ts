import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { reviewSchema, reviewSubmission } from '@/server/modules/homework/service'

/** PATCH — teacher marks a submission reviewed or sends it back to redo. */
export const PATCH = route(
  async (req: NextRequest, ctx, params) =>
    ok(await reviewSubmission(ctx, params.id!, reviewSchema.parse(await req.json()))),
  { permission: 'homework.review', rateLimitKey: 'mutation' },
)
