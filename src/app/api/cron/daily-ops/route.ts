import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assertCronSecret } from '@/server/api/cron-auth'
import { runDigestTick } from '@/server/modules/daily-ops/digest'

/** POST with CRON_SECRET every 15 minutes. Each school's summaries go out once a day at its chosen times. */
export const POST = publicRoute(async (req: NextRequest) => {
  assertCronSecret(req)
  const digest = await runDigestTick()
  return ok({ digest })
})
