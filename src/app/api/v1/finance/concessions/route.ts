import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { concessionSchema, grantConcession, listConcessions } from '@/server/modules/finance/service'

export const GET = route(async (_req, ctx) => ok(await listConcessions(ctx)), {
  permission: 'fees.concession',
})

export const POST = route(
  async (req: NextRequest, ctx) =>
    ok(await grantConcession(ctx, concessionSchema.parse(await req.json())), undefined, { status: 201 }),
  { permission: 'fees.concession', rateLimitKey: 'mutation' },
)
