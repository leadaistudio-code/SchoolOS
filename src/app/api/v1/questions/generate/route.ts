import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { generateQuestions, generateSchema } from '@/server/modules/questions/generate'

/**
 * Generates draft questions from the school's own syllabus.
 *
 * Rate-limited on the mutation bucket rather than the read one: every call
 * costs the school money, and a stuck retry loop should hit a wall quickly.
 */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = generateSchema.parse(await req.json())
    return ok(await generateQuestions(ctx, input), undefined, { status: 201 })
  },
  { permission: 'questionbank.generate', rateLimitKey: 'mutation' },
)
