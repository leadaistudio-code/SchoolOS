import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  deleteTopic,
  topicUpdateSchema,
  updateTopic,
} from '@/server/modules/curriculum/service'

export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const input = topicUpdateSchema.parse(await req.json())
    return ok(await updateTopic(ctx, params.id!, input))
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req: NextRequest, ctx, params) => {
    await deleteTopic(ctx, params.id!)
    return ok({ deleted: true })
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)
