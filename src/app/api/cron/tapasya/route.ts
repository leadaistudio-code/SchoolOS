import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { env } from '@/lib/env'
import { runTapasyaJobs, type TapasyaJob } from '@/server/modules/tapasya/jobs'

/**
 * POST /api/cron/tapasya?job=all   (Authorization: Bearer <CRON_SECRET>)
 *
 * Suggested schedule: `reconcile` and `sweep` every 15 minutes, `rebuild` and
 * `snapshot` once a day just after midnight in the leaderboard timezone.
 */
const VALID: TapasyaJob[] = ['reconcile', 'sweep', 'rebuild', 'snapshot', 'all']

export const POST = publicRoute(async (req: NextRequest) => {
  const secret = env().CRON_SECRET
  if (!secret) throw new ApiException(503, 'CRON_DISABLED', 'Scheduled jobs are not configured (set CRON_SECRET).')
  const provided = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (provided !== secret) throw new ApiException(401, 'UNAUTHORIZED', 'Invalid or missing cron secret.')
  const param = (new URL(req.url).searchParams.get('job') ?? 'all') as TapasyaJob
  return ok(await runTapasyaJobs(VALID.includes(param) ? param : 'all'))
})
