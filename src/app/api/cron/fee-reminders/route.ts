import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { env } from '@/lib/env'
import {
  runAutomatedFeeReminders,
  runLateFeeRules,
  runScheduledMonthlyFeeInvoices,
  syncTransportFeeInvoices,
} from '@/server/modules/finance/jobs'
import { reconcilePendingOnlineRefunds } from '@/server/modules/finance/payments'

/** POST with CRON_SECRET. Schedule daily after the school day begins. */
export const POST = publicRoute(async (req: NextRequest) => {
  const secret = env().CRON_SECRET
  if (!secret) throw new ApiException(503, 'CRON_DISABLED', 'Scheduled jobs are not configured.')
  const provided =
    req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    ?? ''
  if (provided !== secret) throw new ApiException(401, 'UNAUTHORIZED', 'Invalid or missing cron secret.')
  const [monthlyInvoices, transport, reminders, lateFees, refunds] = await Promise.all([
    runScheduledMonthlyFeeInvoices(),
    syncTransportFeeInvoices(),
    runAutomatedFeeReminders(),
    runLateFeeRules(),
    reconcilePendingOnlineRefunds(),
  ])
  return ok({ monthlyInvoices, transport, reminders, lateFees, refunds })
})
