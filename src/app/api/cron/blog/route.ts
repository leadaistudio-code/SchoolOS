import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assertCronSecret } from '@/server/api/cron-auth'
import { runDailyBlog } from '@/server/modules/blog/generate'

export const maxDuration = 300

/** POST with CRON_SECRET once a day. Writes at most one article per India day; `?force=1` writes another. */
export const POST = publicRoute(async (req: NextRequest) => {
  assertCronSecret(req)
  const blog = await runDailyBlog({ force: req.nextUrl.searchParams.get('force') === '1' })
  return ok({ blog })
})
