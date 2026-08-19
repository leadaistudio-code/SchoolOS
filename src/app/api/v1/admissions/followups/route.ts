import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createFollowUp, listFollowUps } from '@/server/modules/admissions/service'
import { followUpCreateSchema } from '@/server/modules/admissions/schema'
import { z } from 'zod'

/** GET /api/v1/admissions/followups — what is due, and what is overdue. */
export const GET = route(async (_req, ctx) => ok(await listFollowUps(ctx)), {
  permission: 'admissions.view',
})

const createSchema = followUpCreateSchema.and(z.object({ leadId: z.string().min(1) }))

/** POST /api/v1/admissions/followups — book the next call. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const { leadId, ...input } = createSchema.parse(await req.json())
    return ok(await createFollowUp(ctx, leadId, input))
  },
  { permission: 'admissions.manage', rateLimitKey: 'mutation' },
)
