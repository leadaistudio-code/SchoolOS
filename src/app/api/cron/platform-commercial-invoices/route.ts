import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { env } from '@/lib/env'
import { runMonthlyCommercialInvoices } from '@/server/modules/platform/commercial-invoices'

/**
 * POST with CRON_SECRET.
 * Creates this month's commercial invoices from autoMonthly schedules
 * only for tenants on a MONTHLY subscription.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const secret = env().CRON_SECRET
  if (!secret) throw new ApiException(503, 'CRON_DISABLED', 'Scheduled jobs are not configured.')
  const provided =
    req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    ?? ''
  if (provided !== secret) throw new ApiException(401, 'UNAUTHORIZED', 'Invalid or missing cron secret.')
  const result = await runMonthlyCommercialInvoices()
  return ok(result)
})
