import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { fixedAssetReconciliation } from '@/server/modules/accounting/fixed-assets-service'

export const GET = route(
  async (req: NextRequest, ctx) => ok(await fixedAssetReconciliation(ctx, req.nextUrl.searchParams.get('asOf') ?? undefined)),
  { permission: 'accounts.view' },
)
