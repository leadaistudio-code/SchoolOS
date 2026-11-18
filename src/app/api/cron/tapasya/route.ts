import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assertCronSecret } from '@/server/api/cron-auth'
import { runTapasyaJobs, type TapasyaJob } from '@/server/modules/tapasya/jobs'

/**
 * POST /api/cron/tapasya?job=all   (Authorization: Bearer <CRON_SECRET>)
 *
 * Suggested schedule: `reconcile` and `sweep` every 15 minutes, `rebuild` and
 * `snapshot` once a day just after midnight in the leaderboard timezone.
 */
const VALID: TapasyaJob[] = ['reconcile', 'sweep', 'rebuild', 'snapshot', 'all']

export const POST = publicRoute(async (req: NextRequest) => {
  assertCronSecret(req)
  const param = (new URL(req.url).searchParams.get('job') ?? 'all') as TapasyaJob
  return ok(await runTapasyaJobs(VALID.includes(param) ? param : 'all'))
})
