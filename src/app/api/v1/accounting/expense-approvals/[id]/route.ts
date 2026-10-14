import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getExpenseRequest, transitionExpenseRequest, updateExpenseRequest } from '@/server/modules/accounting/expense-approval-service'

export const GET = route(async (_req: NextRequest, ctx, params) => ok(await getExpenseRequest(ctx, params.id!)))

/** PATCH: the creator corrects a draft or returned request. */
export const PATCH = route(
  async (req: NextRequest, ctx, params) => ok(await updateExpenseRequest(ctx, params.id!, await req.json())),
  { permission: 'expenses.manage', rateLimitKey: 'mutation' },
)

/**
 * POST { action: submit | approve | return | reject | withdraw | reverse, remarks?, expectedStatus? }.
 * Stage permissions and separation of duties are enforced in the service.
 */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const result = await transitionExpenseRequest(ctx, params.id!, await req.json())
    return ok({ request: result.request, expenseId: result.expenseId, journalNumber: result.journalNumber })
  },
  { rateLimitKey: 'mutation' },
)
