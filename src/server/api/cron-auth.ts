import type { NextRequest } from 'next/server'
import { timingSafeEqual } from '@/server/crypto'
import { env } from '@/lib/env'
import { ApiException } from '@/server/api/response'

/**
 * Shared gate for `/api/cron/*`. Compares secrets in constant time so a wrong
 * guess does not leak length via early return on `!==`.
 */
export function assertCronSecret(req: NextRequest, options?: { secret?: string }): void {
  const secret = options?.secret ?? env().CRON_SECRET
  if (!secret) {
    throw new ApiException(503, 'CRON_DISABLED', 'Scheduled jobs are not configured (set CRON_SECRET).')
  }

  const provided =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''

  if (!provided || !timingSafeEqual(provided, secret)) {
    throw new ApiException(401, 'UNAUTHORIZED', 'Invalid or missing cron secret.')
  }
}
