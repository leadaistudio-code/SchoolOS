import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import {
  cancelFixedAsset,
  disposeFixedAsset,
  getFixedAsset,
  reverseDisposal,
  updateFixedAsset,
} from '@/server/modules/accounting/fixed-assets-service'

export const GET = route(async (_req: NextRequest, ctx, params) => ok(await getFixedAsset(ctx, params.id!)), { permission: 'accounts.view' })

export const PATCH = route(
  async (req: NextRequest, ctx, params) => ok(await updateFixedAsset(ctx, params.id!, await req.json())),
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)

/** POST { action: 'dispose', disposedOn, proceedsMinor, proceedsAccountId?, reason } | { action: 'reverse-disposal' | 'cancel', reason } */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = (await req.json()) as { action?: string; reason?: unknown }
    if (body.action === 'dispose') return ok(await disposeFixedAsset(ctx, params.id!, body))
    if (body.action === 'reverse-disposal') return ok(await reverseDisposal(ctx, params.id!, body.reason))
    if (body.action === 'cancel') return ok(await cancelFixedAsset(ctx, params.id!, body.reason))
    throw badRequest('Unknown action')
  },
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
