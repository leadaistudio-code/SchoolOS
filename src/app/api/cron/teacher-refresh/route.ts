import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assertCronSecret } from '@/server/api/cron-auth'
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
  assertCronSecret(req)

  const jobParam = (new URL(req.url).searchParams.get('job') ?? 'all') as RefreshJobKind
  const job: RefreshJobKind = VALID_JOBS.includes(jobParam) ? jobParam : 'all'

  const report = await runTeacherRefreshJobs(job)
  return ok(report)
})
