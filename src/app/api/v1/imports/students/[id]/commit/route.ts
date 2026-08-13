import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { commitStudentImport } from '@/server/modules/imports/service'

export const POST = route(
  async (_req: NextRequest, ctx, params) => {
    const batch = await commitStudentImport(ctx, params.id!)
    return ok(batch)
  },
  { permission: 'students.import', rateLimitKey: 'mutation' },
)
