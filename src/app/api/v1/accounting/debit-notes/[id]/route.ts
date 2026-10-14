import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { cancelDebitNote, decideDebitNote } from '@/server/modules/accounting/payables-service'

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), reason: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal('cancel'), reason: z.string().trim().min(3).max(1000) }),
])

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = actionSchema.parse(await req.json())
    if (body.action === 'cancel') return ok(await cancelDebitNote(ctx, params.id!, body.reason))
    return ok(await decideDebitNote(ctx, params.id!, body.action, body.action === 'reject' ? body.reason : undefined))
  },
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
