import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  getParent,
  linkChild,
  linkChildSchema,
  parentUpdateSchema,
  unlinkChild,
  updateParent,
} from '@/server/modules/people/service'

export const GET = route(
  async (_req, ctx, params) => ok(await getParent(ctx, params.id!)),
  { permission: 'parents.view' },
)

export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    // Linking a child is an edit of the parent record, so it shares this route.
    if (body?.action === 'LINK_CHILD') {
      return ok(await linkChild(ctx, params.id!, linkChildSchema.parse(body)))
    }
    if (body?.action === 'UNLINK_CHILD') {
      return ok(await unlinkChild(ctx, params.id!, String(body.studentId)))
    }
    return ok(await updateParent(ctx, params.id!, parentUpdateSchema.parse(body)))
  },
  { permission: 'parents.edit', rateLimitKey: 'mutation' },
)
