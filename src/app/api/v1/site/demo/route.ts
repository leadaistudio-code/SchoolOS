import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok, badRequest } from '@/server/api/response'
import { rateLimit } from '@/server/rate-limit'
import { requestMeta } from '@/server/auth/session'
import { demoRequestSchema, recordDemoRequest } from '@/server/modules/site/demo'

/**
 * The public demo form.
 *
 * Unauthenticated by necessity, so it carries its own defences: a rate limit
 * per address, and a honeypot field that a person never sees. Both fail
 * quietly — a bot learns nothing from the response.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const meta = await requestMeta().catch(() => ({ ip: null, userAgent: null }))

  const limited = await rateLimit(`site:demo:${meta.ip ?? 'unknown'}`, 5, 3600)
  if (!limited.ok) {
    throw badRequest('Too many requests from this connection. Please email us instead.')
  }

  const input = demoRequestSchema.parse(await req.json())

  // Honeypot. Answer as though it worked; there is nothing to be gained by
  // telling an automated submitter that it was caught.
  if (input.website) return ok({ received: true })

  await recordDemoRequest(input, {
    ip: meta.ip,
    userAgent: meta.userAgent,
    referer: req.headers.get('referer'),
  })

  return ok({ received: true })
})
