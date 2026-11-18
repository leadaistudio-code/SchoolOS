import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assertCronSecret } from '@/server/api/cron-auth'
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
  assertCronSecret(req)
  const report = await runGrowthCrmReminders()
  return ok(report)
})
