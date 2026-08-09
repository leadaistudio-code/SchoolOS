import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  deleteHomework,
  getHomework,
  homeworkUpdateSchema,
  submissionSchema,
  submitHomework,
  updateHomework,
} from '@/server/modules/homework/service'

export const GET = route(async (_req, ctx, params) => ok(await getHomework(ctx, params.id!)), {
  permission: 'homework.view',
})

export const PATCH = route(
  async (req: NextRequest, ctx, params) =>
    ok(await updateHomework(ctx, params.id!, homeworkUpdateSchema.parse(await req.json()))),
  { permission: 'homework.edit', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req, ctx, params) => ok(await deleteHomework(ctx, params.id!)),
  { permission: 'homework.delete', rateLimitKey: 'mutation' },
)

/** POST /homework/{id} — a student (or their parent) hands the work in. */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = submissionSchema.parse({ ...body, homeworkId: params.id })
    return ok(await submitHomework(ctx, input), undefined, { status: 201 })
  },
  { permission: 'homework.submit', rateLimitKey: 'mutation' },
)
