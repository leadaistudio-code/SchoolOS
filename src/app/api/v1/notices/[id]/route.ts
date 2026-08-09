import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  deleteNotice,
  getNotice,
  noticeUpdateSchema,
  updateNotice,
} from '@/server/modules/notices/service'

export const GET = route(async (_req, ctx, params) => ok(await getNotice(ctx, params.id!)), {
  permission: 'notices.view',
})

export const PATCH = route(
  async (req: NextRequest, ctx, params) =>
    ok(await updateNotice(ctx, params.id!, noticeUpdateSchema.parse(await req.json()))),
  { permission: 'notices.edit', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req, ctx, params) => ok(await deleteNotice(ctx, params.id!)),
  { permission: 'notices.delete', rateLimitKey: 'mutation' },
)
