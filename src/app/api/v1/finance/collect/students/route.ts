import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { searchCollectStudents } from '@/server/modules/finance/counter'

/** GET — student lookup for the fee counter (needs only `fees.collect`). */
export const GET = route(
  async (req: NextRequest, ctx) =>
    ok(await searchCollectStudents(ctx, req.nextUrl.searchParams.get('q') ?? '')),
  { permission: 'fees.collect' },
)
