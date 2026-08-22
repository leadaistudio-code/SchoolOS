import type { NextRequest } from 'next/server'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import { ingestFixes, tenantForToken } from '@/server/modules/transport/ingest'

/**
 * POST /api/v1/transport/ingest
 *
 * Positions from a GPS server or a tracker vendor's middleware.
 *
 * Not wrapped in `route()` — that helper establishes a signed-in user, and the
 * caller here is a machine. Authentication is a bearer token that resolves to
 * the tenant, which is the only thing that decides whose buses these positions
 * belong to, so it is checked before anything else happens.
 *
 * Answers 202 rather than 201 even when some fixes were dropped. A tracker
 * that receives an error retries the whole batch forever; telling it the batch
 * was received and reporting what could not be matched in the body is the only
 * behaviour that does not turn one mistyped device id into a retry storm.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const header = req.headers.get('authorization') ?? ''
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : ''

  if (!bearer) {
    return json({ error: { code: 'UNAUTHORIZED', message: 'Send an ingest token as a bearer token' } }, 401)
  }

  // Rate limited on the token itself, before the database is touched: an
  // unauthenticated flood must not be able to make us do lookups.
  const limit = RATE_LIMITS.webhook
  const limited = await rateLimit(`gps-ingest:${bearer.slice(0, 24)}`, limit.limit, limit.windowSeconds)
  if (!limited.ok) {
    return json({ error: { code: 'RATE_LIMITED', message: 'Too many position reports' } }, 429)
  }

  const auth = await tenantForToken(bearer)
  if (!auth) {
    // Deliberately the same answer for an unknown token and a revoked one.
    return json({ error: { code: 'UNAUTHORIZED', message: 'That ingest token is not valid' } }, 401)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: { code: 'BAD_REQUEST', message: 'Body must be JSON' } }, 400)
  }

  try {
    const outcome = await ingestFixes(auth.tenantId, auth.tokenId, body)
    return json({ data: outcome }, 202)
  } catch {
    return json({ error: { code: 'SERVER_ERROR', message: 'The positions could not be stored' } }, 500)
  }
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
