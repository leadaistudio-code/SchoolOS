import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { attachExpenseReceipt, removeExpenseReceipt } from '@/server/modules/finance/expenses'

/** POST multipart/form-data `file`: attaches a bill / receipt scan to an expense. */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiException(400, 'BAD_REQUEST', 'No file was uploaded')
    const result = await attachExpenseReceipt(ctx, params.id!, file)
    return ok(result, undefined, { status: 201 })
  },
  { permission: 'expenses.manage', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req: NextRequest, ctx, params) => {
    await removeExpenseReceipt(ctx, params.id!)
    return ok({ removed: true })
  },
  { permission: 'expenses.manage', rateLimitKey: 'mutation' },
)
