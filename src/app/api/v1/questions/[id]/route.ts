import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  deleteQuestion,
  getQuestion,
  questionUpdateSchema,
  updateQuestion,
} from '@/server/modules/questions/service'

export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await getQuestion(ctx, params.id!)),
  { permission: 'questionbank.view' },
)

export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const input = questionUpdateSchema.parse(await req.json())
    return ok(await updateQuestion(ctx, params.id!, input))
  },
  { permission: 'questionbank.edit', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req: NextRequest, ctx, params) => {
    await deleteQuestion(ctx, params.id!)
    return ok({ deleted: true })
  },
  { permission: 'questionbank.delete', rateLimitKey: 'mutation' },
)
