import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createDebitNote } from '@/server/modules/accounting/payables-service'

export const POST = route(
  async (req: NextRequest, ctx) => ok(await createDebitNote(ctx, await req.json()), undefined, { status: 201 }),
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
