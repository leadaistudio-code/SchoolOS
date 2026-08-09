import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { archiveStaff, getStaff, staffUpdateSchema, updateStaff } from '@/server/modules/people/service'

export const GET = route(async (_req, ctx, params) => ok(await getStaff(ctx, params.id!)), {
  permission: 'staff.view',
})

export const PATCH = route(
  async (req: NextRequest, ctx, params) =>
    ok(await updateStaff(ctx, params.id!, staffUpdateSchema.parse(await req.json()))),
  { permission: 'staff.edit', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (req: NextRequest, ctx, params) =>
    ok(await archiveStaff(ctx, params.id!, req.nextUrl.searchParams.get('reason') ?? undefined)),
  { permission: 'staff.delete', rateLimitKey: 'mutation' },
)
