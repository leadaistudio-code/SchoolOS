import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { submitAttempt } from '@/server/modules/assessments/attempts'

const schema = z.object({ auto: z.boolean().default(false) })

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json().catch(() => ({}))
    const { auto } = schema.parse(body)
    return ok(await submitAttempt(ctx, params.id!, auto))
  },
  { permission: 'assessments.attempt', rateLimitKey: 'mutation' },
)
