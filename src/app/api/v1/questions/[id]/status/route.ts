import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { setQuestionStatus } from '@/server/modules/questions/service'

const schema = z.object({ status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']) })

/** Approval is its own endpoint: a gate that shares a route with ordinary
  * editing is a gate that gets opened by accident. */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const { status } = schema.parse(await req.json())
    return ok(await setQuestionStatus(ctx, params.id!, status))
  },
  { permission: 'questionbank.approve', rateLimitKey: 'mutation' },
)
