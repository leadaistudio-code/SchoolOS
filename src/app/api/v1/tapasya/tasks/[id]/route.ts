import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { deleteOwnTask, updateOwnTask } from '@/server/modules/tapasya/tasks'
import { taskUpdateSchema } from '@/server/modules/tapasya/schema'

export const PATCH = route(
  async (req: NextRequest, ctx, params) => ok(await updateOwnTask(ctx, params.id!, taskUpdateSchema.parse(await req.json()))),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req, ctx, params) => {
    await deleteOwnTask(ctx, params.id!)
    return ok({ deleted: true })
  },
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
