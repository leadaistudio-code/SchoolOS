import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { env } from '@/lib/env'
import { runDailyBlog } from '@/server/modules/blog/generate'

export const maxDuration = 300

/** POST with CRON_SECRET once a day. Writes at most one article per India day; `?force=1` writes another. */
export const POST = publicRoute(async (req: NextRequest) => {
  const secret = env().CRON_SECRET
  if (!secret) throw new ApiException(503, 'CRON_DISABLED', 'Scheduled jobs are not configured.')
  const provided =
    req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    ?? ''
  if (provided !== secret) throw new ApiException(401, 'UNAUTHORIZED', 'Invalid or missing cron secret.')
  const blog = await runDailyBlog({ force: req.nextUrl.searchParams.get('force') === '1' })
  return ok({ blog })
})
