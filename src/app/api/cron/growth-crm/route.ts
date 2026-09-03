import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { env } from '@/lib/env'
import { runGrowthCrmReminders } from '@/server/modules/platform/growth/jobs'

/**
 * Growth CRM reminder trigger.
 *
 *   POST /api/cron/growth-crm
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Same gate as teacher-refresh. Run every 15 minutes from the host scheduler.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const secret = env().CRON_SECRET
  if (!secret) {
    throw new ApiException(503, 'CRON_DISABLED', 'Scheduled jobs are not configured (set CRON_SECRET).')
  }

  const provided =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  if (provided !== secret) {
    throw new ApiException(401, 'UNAUTHORIZED', 'Invalid or missing cron secret.')
  }

  const report = await runGrowthCrmReminders()
  return ok(report)
})
