import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { rebuildAnalytics } from '@/server/modules/accounting/analytics-service'

/** POST: rebuilds the school's analytics summary from the journal. */
export const POST = route(
  async (_req, ctx) => {
    const fresh = await rebuildAnalytics(ctx)
    return ok({ refreshedAt: fresh.refreshedAt, outcome: fresh.outcome })
  },
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
