import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { payablesReconciliation } from '@/server/modules/accounting/payables-service'

/** Vendor sub-ledger against the Sundry Creditors control account. */
export const GET = route(
  async (_req: NextRequest, ctx) => ok(await payablesReconciliation(ctx)),
  { permission: 'accounts.view' },
)
