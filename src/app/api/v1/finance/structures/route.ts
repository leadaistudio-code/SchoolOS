import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  createStructure,
  listStructures,
  structureSchema,
} from '@/server/modules/finance/service'

export const GET = route(async (_req, ctx) => ok(await listStructures(ctx)), {
  permission: 'fees.view',
})

export const POST = route(
  async (req: NextRequest, ctx) =>
    ok(await createStructure(ctx, structureSchema.parse(await req.json())), undefined, {
      status: 201,
    }),
  { permission: 'fees.structure', rateLimitKey: 'mutation' },
)
