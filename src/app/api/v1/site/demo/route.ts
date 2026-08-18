import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok, badRequest } from '@/server/api/response'
import { rateLimit } from '@/server/rate-limit'
import { requestMeta } from '@/server/auth/session'
import {
  demoRequestSchema,
  emailDemoRequest,
  recordDemoRequest,
} from '@/server/modules/site/demo'

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

  const requestMetaForRecord = {
    ip: meta.ip,
    userAgent: meta.userAgent,
    referer: req.headers.get('referer'),
  }

  const job = await recordDemoRequest(input, requestMetaForRecord)

  // Awaited rather than left floating: on a serverless host the process can be
  // frozen the moment the response is returned, and a lead that only exists in
  // a database nobody watches is a lead nobody answers. It cannot throw and it
  // times out on its own, so the visitor is not left waiting on a mail server.
  await emailDemoRequest(input, requestMetaForRecord, job.id)

  return ok({ received: true })
})
