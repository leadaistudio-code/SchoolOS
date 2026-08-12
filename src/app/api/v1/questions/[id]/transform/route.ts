import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { transformQuestion, transformSchema } from '@/server/modules/questions/generate'

/** Produces a draft variant of one question. The original is left alone. */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const { action } = transformSchema.parse(await req.json())
    return ok(await transformQuestion(ctx, params.id!, action), undefined, { status: 201 })
  },
  { permission: 'questionbank.generate', rateLimitKey: 'mutation' },
)
