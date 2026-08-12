import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  curriculumUpdateSchema,
  deleteCurriculum,
  getCurriculum,
  updateCurriculum,
} from '@/server/modules/curriculum/service'

export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await getCurriculum(ctx, params.id!)),
  { permission: 'curriculum.view' },
)

export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const input = curriculumUpdateSchema.parse(await req.json())
    return ok(await updateCurriculum(ctx, params.id!, input))
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req: NextRequest, ctx, params) => {
    await deleteCurriculum(ctx, params.id!)
    return ok({ deleted: true })
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)
