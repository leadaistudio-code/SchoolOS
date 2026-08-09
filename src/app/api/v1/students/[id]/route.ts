import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  archiveStudent,
  getStudent,
  updateStudent,
} from '@/server/modules/students/service'
import { studentUpdateSchema } from '@/server/modules/students/schema'

export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await getStudent(ctx, params.id!)),
  { permission: 'students.view' },
)

export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const input = studentUpdateSchema.parse(await req.json())
    return ok(await updateStudent(ctx, params.id!, input))
  },
  { permission: 'students.edit', rateLimitKey: 'mutation' },
)

/** Archives rather than deletes; see the service for why. */
export const DELETE = route(
  async (req: NextRequest, ctx, params) => {
    const reason = req.nextUrl.searchParams.get('reason') ?? undefined
    return ok(await archiveStudent(ctx, params.id!, reason))
  },
  { permission: 'students.delete', rateLimitKey: 'mutation' },
)
