import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { deleteQuestions } from '@/server/modules/questions/service'

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
})

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = schema.parse(await req.json())
    return ok(await deleteQuestions(ctx, input.ids))
  },
  { permission: 'questionbank.delete', rateLimitKey: 'mutation' },
)
