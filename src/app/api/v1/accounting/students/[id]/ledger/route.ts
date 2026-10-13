import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  getStudentLedger,
  studentLedgerQuerySchema,
} from '@/server/modules/accounting/student-ledger-service'

/** Read-only statement of account projected from the fee module. */
export const GET = route(
  async (req: NextRequest, ctx, params) => {
    const query = studentLedgerQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const ledger = await getStudentLedger(ctx, params.id!, query)
    return ok(ledger, {
      page: ledger.page,
      pageSize: ledger.pageSize,
      total: ledger.totalRows,
      totalPages: Math.max(1, Math.ceil(ledger.totalRows / ledger.pageSize)),
    })
  },
  { permission: 'fees.view' },
)
