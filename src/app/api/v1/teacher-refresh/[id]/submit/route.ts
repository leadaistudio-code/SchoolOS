import { route } from '@/server/api/handler'
import { submitRefresherAttempt } from '@/server/modules/teacher-refresh/service'
import { ok } from '@/server/api/response'
import { z } from 'zod'

const submitSchema = z.object({
  answers: z.array(z.object({
    refreshQuestionId: z.string(),
    selectedIndexes: z.array(z.number())
  }))
})

export const POST = route(
  async (req, ctx, params) => {
    const body = await req.json()
    const input = submitSchema.parse(body)
    const attempt = await submitRefresherAttempt(ctx, params.id!, input.answers)
    return ok(attempt)
  },
  { rateLimitKey: 'mutation' }
)
