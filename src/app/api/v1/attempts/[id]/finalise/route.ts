import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { finaliseAttempt, finaliseSchema } from '@/server/modules/assessments/evaluation'

/** Totals the paper. Refuses while a written answer is unmarked. */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json().catch(() => ({}))
    const input = finaliseSchema.parse(body)
    return ok(await finaliseAttempt(ctx, params.id!, input))
  },
  { permission: 'assessments.evaluate', rateLimitKey: 'mutation' },
)
