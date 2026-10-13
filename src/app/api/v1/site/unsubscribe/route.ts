import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok, badRequest, notFound } from '@/server/api/response'
import { rateLimit } from '@/server/rate-limit'
import { requestMeta } from '@/server/auth/session'
import { unsubscribeByToken } from '@/server/modules/platform/mail/campaigns'

/**
 * Opt-out from bulk email.
 *
 * Two callers: mail clients sending the RFC 8058 one-click POST
 * (`List-Unsubscribe=One-Click`, token in the query string), and the
 * unsubscribe page's button (JSON body). A GET never unsubscribes — link
 * scanners in school mail gateways fetch every URL in a message.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const meta = await requestMeta().catch(() => ({ ip: null, userAgent: null }))
  const limited = await rateLimit(`site:unsubscribe:${meta.ip ?? 'unknown'}`, 30, 3600)
  if (!limited.ok) throw badRequest('Too many requests. Please try again later.')

  const fromQuery = req.nextUrl.searchParams.get('t')
  const type = req.headers.get('content-type') ?? ''
  let token = fromQuery ?? ''
  let reason: string | null = null
  let source: 'LINK' | 'ONE_CLICK' = 'ONE_CLICK'
  if (type.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as { token?: unknown; reason?: unknown }
    if (typeof body.token === 'string') token = body.token
    if (typeof body.reason === 'string') reason = body.reason.trim() || null
    source = 'LINK'
  }

  const done = await unsubscribeByToken(token, source, reason)
  if (!done) throw notFound('Unsubscribe link')
  return ok({ unsubscribed: true })
})
