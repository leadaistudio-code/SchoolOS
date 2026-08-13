import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getStudentImport } from '@/server/modules/imports/service'

export const GET = route(
  async (_req: NextRequest, ctx, params) => {
    const batch = await getStudentImport(ctx, params.id!)
    return ok(batch)
  },
  { permission: 'students.import' },
)
