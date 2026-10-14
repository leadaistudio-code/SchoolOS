import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createDepreciationRun, listDepreciationRuns, previewDepreciation } from '@/server/modules/accounting/fixed-assets-service'

/** GET ?periodEnd=YYYY-MM-DD: the runs so far and a preview of that period (nothing is posted). */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const periodEnd = req.nextUrl.searchParams.get('periodEnd') ?? undefined
    const [runs, preview] = await Promise.all([listDepreciationRuns(ctx), previewDepreciation(ctx, periodEnd)])
    return ok({ runs, preview })
  },
  { permission: 'accounts.view' },
)

/** POST { periodEnd, idempotencyKey }: posts the run, or submits it for approval when approvals are on. */
export const POST = route(
  async (req: NextRequest, ctx) => ok(await createDepreciationRun(ctx, await req.json()), undefined, { status: 201 }),
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
