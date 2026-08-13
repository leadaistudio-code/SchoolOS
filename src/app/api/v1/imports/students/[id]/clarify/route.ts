import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { importClarifyInputSchema } from '@/server/modules/imports/schema'
import { clarifyStudentImport } from '@/server/modules/imports/service'

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = importClarifyInputSchema.parse(body)
    const batch = await clarifyStudentImport(ctx, params.id!, input)
    return ok(batch)
  },
  { permission: 'students.import', rateLimitKey: 'mutation' },
)
