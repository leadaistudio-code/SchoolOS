import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { retryOutbox } from '@/server/modules/whatsapp-receipts/service'

/** POST: queue a failed, given-up or skipped receipt message again. */
export const POST = route(
  async (_req: NextRequest, ctx, params) => {
    await retryOutbox(ctx, params.id!)
    return ok({ queued: true })
  },
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
