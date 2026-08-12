import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createTopic, listTopicsFor, topicCreateSchema } from '@/server/modules/curriculum/service'

const query = z.object({ classSubjectId: z.string().min(1) })

/** Chapters with their topics, for tagging a question or scoping a paper. */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const { classSubjectId } = query.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )
    return ok(await listTopicsFor(ctx, classSubjectId))
  },
  { permission: 'curriculum.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = topicCreateSchema.parse(await req.json())
    return ok(await createTopic(ctx, input), undefined, { status: 201 })
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)
