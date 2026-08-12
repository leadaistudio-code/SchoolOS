import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  chapterUpdateSchema,
  deleteChapter,
  updateChapter,
} from '@/server/modules/curriculum/service'

export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const input = chapterUpdateSchema.parse(await req.json())
    return ok(await updateChapter(ctx, params.id!, input))
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req: NextRequest, ctx, params) => {
    await deleteChapter(ctx, params.id!)
    return ok({ deleted: true })
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)
