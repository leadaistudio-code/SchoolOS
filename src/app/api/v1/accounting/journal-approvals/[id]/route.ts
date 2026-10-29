import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { actOnJournal } from '@/server/modules/accounting/journal-approval-service'

/**
 * POST { action: approve | return | resubmit, remarks?, expectedStatus? }.
 * Stage permissions and separation of duties are enforced in the service.
 */
export const POST = route(
  async (req: NextRequest, ctx, params) => ok(await actOnJournal(ctx, params.id!, await req.json())),
  { rateLimitKey: 'mutation' },
)
