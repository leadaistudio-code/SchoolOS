import type { NextRequest } from 'next/server'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import { pairConnector } from '@/server/modules/device-gateway/pairing'
import { machineJson } from '@/server/modules/device-gateway/machine'
import { ApiException } from '@/server/api/response'

/**
 * POST /api/v1/device-gateway/pair
 * Exchange a short-lived pairing code for a long-lived connector credential.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const limited = await rateLimit('device-gateway-pair', RATE_LIMITS.webhook.limit, RATE_LIMITS.webhook.windowSeconds)
  if (!limited.ok) {
    return machineJson({ error: { code: 'RATE_LIMITED', message: 'Too many pairing attempts' } }, 429)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return machineJson({ error: { code: 'BAD_REQUEST', message: 'Body must be JSON' } }, 400)
  }

  try {
    const outcome = await pairConnector(body)
    return machineJson({ data: outcome, error: null }, 201)
  } catch (err) {
    if (err instanceof ApiException) {
      return machineJson({ error: { code: err.code, message: err.message } }, err.status)
    }
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ZodError') {
      return machineJson({ error: { code: 'VALIDATION_ERROR', message: 'Invalid pairing payload' } }, 422)
    }
    console.error('[device-gateway] pair failed', err)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Pairing failed' } }, 500)
  }
}
