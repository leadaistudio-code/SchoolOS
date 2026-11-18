import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assertCronSecret } from '@/server/api/cron-auth'
import {
  runAutomatedFeeReminders,
  runLateFeeRules,
  runScheduledMonthlyFeeInvoices,
  syncTransportFeeInvoices,
} from '@/server/modules/finance/jobs'
import { reconcilePendingOnlineRefunds } from '@/server/modules/finance/payments'
import { runLedgerCatchUp } from '@/server/modules/accounts/posting'
import { runLabAlerts } from '@/server/modules/labs/jobs'

/** POST with CRON_SECRET. Schedule daily after the school day begins. */
export const POST = publicRoute(async (req: NextRequest) => {
  assertCronSecret(req)
  const [monthlyInvoices, transport, reminders, lateFees, refunds] = await Promise.all([
    runScheduledMonthlyFeeInvoices(),
    syncTransportFeeInvoices(),
    runAutomatedFeeReminders(),
    runLateFeeRules(),
    reconcilePendingOnlineRefunds(),
  ])
  const ledger = await runLedgerCatchUp()
  // Rides on this daily schedule; a failure here must not fail the fee jobs.
  const labs = await runLabAlerts().catch((error: unknown) => ({ error: String(error) }))
  return ok({ monthlyInvoices, transport, reminders, lateFees, refunds, ledger, labs })
})
