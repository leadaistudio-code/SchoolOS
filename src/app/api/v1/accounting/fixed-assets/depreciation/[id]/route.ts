import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import { decideDepreciationRun, getDepreciationRun, reverseDepreciationRun } from '@/server/modules/accounting/fixed-assets-service'

export const GET = route(async (_req: NextRequest, ctx, params) => ok(await getDepreciationRun(ctx, params.id!)), { permission: 'accounts.view' })

/** POST { action: 'approve' } | { action: 'reject' | 'reverse', reason } */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = (await req.json()) as { action?: string; reason?: unknown }
    if (body.action === 'approve' || body.action === 'reject') return ok(await decideDepreciationRun(ctx, params.id!, body.action, body.reason))
    if (body.action === 'reverse') return ok(await reverseDepreciationRun(ctx, params.id!, body.reason))
    throw badRequest('Unknown action')
  },
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
