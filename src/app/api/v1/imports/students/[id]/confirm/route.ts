import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { importMapInputSchema } from '@/server/modules/imports/schema'
import { confirmStudentImportMapping } from '@/server/modules/imports/service'

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = importMapInputSchema.parse(body)
    const answers =
      body.answers && typeof body.answers === 'object'
        ? (body.answers as Record<string, string>)
        : undefined
    const batch = await confirmStudentImportMapping(ctx, params.id!, { ...input, answers })
    return ok(batch)
  },
  { permission: 'students.import', rateLimitKey: 'mutation' },
)
