import type { NextRequest } from 'next/server'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import { connectorForToken } from '@/server/modules/device-gateway/auth'

export function machineJson(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export async function requireConnector(req: NextRequest) {
  const header = req.headers.get('authorization') ?? ''
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!bearer) {
    return {
      error: machineJson(
        { error: { code: 'UNAUTHORIZED', message: 'Send the connector secret as a bearer token' } },
        401,
      ),
    } as const
  }

  const limited = await rateLimit(
    `device-gateway:${bearer.slice(0, 24)}`,
    RATE_LIMITS.webhook.limit,
    RATE_LIMITS.webhook.windowSeconds,
  )
  if (!limited.ok) {
    return {
      error: machineJson(
        { error: { code: 'RATE_LIMITED', message: 'Too many connector requests' } },
        429,
      ),
    } as const
  }

  const auth = await connectorForToken(bearer)
  if (!auth) {
    return {
      error: machineJson(
        { error: { code: 'UNAUTHORIZED', message: 'That connector credential is not valid' } },
        401,
      ),
    } as const
  }

  return { auth } as const
}
