import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  createCurriculum,
  curriculumCreateSchema,
  curriculumFilterSchema,
  listCoverage,
} from '@/server/modules/curriculum/service'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const filter = curriculumFilterSchema.parse(params)
    return ok(await listCoverage(ctx, filter))
  },
  { permission: 'curriculum.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = curriculumCreateSchema.parse(await req.json())
    return ok(await createCurriculum(ctx, input), undefined, { status: 201 })
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)
