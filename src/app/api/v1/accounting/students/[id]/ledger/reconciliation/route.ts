import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getStudentLedgerReconciliation } from '@/server/modules/accounting/student-ledger-service'

/** Diagnostics: the statement checked against the fee module's stored balances. */
export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await getStudentLedgerReconciliation(ctx, params.id!)),
  { permission: 'fees.view' },
)
