import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createTopic, topicCreateSchema } from '@/server/modules/curriculum/service'

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = topicCreateSchema.parse(await req.json())
    return ok(await createTopic(ctx, input), undefined, { status: 201 })
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)
