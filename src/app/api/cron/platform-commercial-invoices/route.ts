import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assertCronSecret } from '@/server/api/cron-auth'
import { runMonthlyCommercialInvoices } from '@/server/modules/platform/commercial-invoices'

/**
 * POST with CRON_SECRET.
 * Creates this month's commercial invoices from autoMonthly schedules
 * only for tenants on a MONTHLY subscription.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  assertCronSecret(req)
  const result = await runMonthlyCommercialInvoices()
  return ok(result)
})
