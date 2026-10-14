import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { attachRequestReceipt } from '@/server/modules/accounting/expense-approval-service'

/** POST multipart/form-data `file`: attaches the bill to an expense awaiting approval. */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiException(400, 'BAD_REQUEST', 'No file was uploaded')
    return ok(await attachRequestReceipt(ctx, params.id!, file), undefined, { status: 201 })
  },
  { permission: 'expenses.manage', rateLimitKey: 'mutation' },
)
