import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { env } from '@/lib/env'
import { runTeacherRefreshJobs, type RefreshJobKind } from '@/server/modules/teacher-refresh/jobs'

/**
 * Scheduled-job trigger for the knowledge refresh module.
 *
 *   POST /api/cron/teacher-refresh?job=all
 *   Authorization: Bearer <CRON_SECRET>       (or  x-cron-secret: <CRON_SECRET>)
 *
 * There is no scheduler in the app; an external trigger calls this. It is
 * unauthenticated in the session sense — it runs across every tenant — so it is
 * gated solely by the shared secret. With `CRON_SECRET` unset the endpoint is
 * refused outright, so a misconfigured deployment cannot leave it wide open.
 */
const VALID_JOBS: RefreshJobKind[] = ['weekly', 'monthly', 'reminders', 'overdue', 'all']

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

  const jobParam = (new URL(req.url).searchParams.get('job') ?? 'all') as RefreshJobKind
  const job: RefreshJobKind = VALID_JOBS.includes(jobParam) ? jobParam : 'all'

  const report = await runTeacherRefreshJobs(job)
  return ok(report)
})
