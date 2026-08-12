import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { placeQuestions, placeSchema } from '@/server/modules/assessments/service'

/** Places bank questions into this section, snapshotting them as they go. */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = placeSchema.parse({ ...body, sectionId: params.id! })
    return ok(await placeQuestions(ctx, input), undefined, { status: 201 })
  },
  { permission: 'assessments.edit', rateLimitKey: 'mutation' },
)
