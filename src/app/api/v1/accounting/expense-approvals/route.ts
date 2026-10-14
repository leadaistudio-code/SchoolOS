import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createExpenseRequest, listExpenseRequests } from '@/server/modules/accounting/expense-approval-service'

/** GET ?view=mine|awaiting|in_progress|closed|all: the approval queue (access checked in the service). */
export const GET = route(async (req: NextRequest, ctx) => {
  const list = await listExpenseRequests(ctx, Object.fromEntries(req.nextUrl.searchParams))
  return ok(
    { rows: list.rows, awaitingMe: list.awaitingMe, byStatus: list.byStatus, workflowOn: list.workflowOn },
    { page: list.page, pageSize: list.pageSize, total: list.total, totalPages: Math.max(1, Math.ceil(list.total / list.pageSize)) },
  )
})

/** POST: stage 1, prepare an expense; `submit: true` sends it to validation at once. */
export const POST = route(
  async (req: NextRequest, ctx) => ok(await createExpenseRequest(ctx, await req.json()), undefined, { status: 201 }),
  { permission: 'expenses.manage', rateLimitKey: 'mutation' },
)
