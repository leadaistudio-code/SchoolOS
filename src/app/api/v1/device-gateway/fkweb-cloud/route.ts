import { after } from 'next/server'
import { env } from '@/lib/env'
import { sha256, timingSafeEqual } from '@/server/crypto'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import { machineJson } from '@/server/modules/device-gateway/machine'
import { ingestCloudFkWebPacket } from '@/server/modules/device-gateway/cloud-ingest'
import { processRawEvent } from '@/server/modules/device-gateway/process-attendance'

export async function POST(req: Request): Promise<Response> {
  const configuredSecret = env().FKWEB_GATEWAY_SECRET
  if (!configuredSecret) {
    return machineJson({ error: { code: 'NOT_CONFIGURED', message: 'Cloud FKWeb gateway is disabled' } }, 503)
  }

  const authorization = req.headers.get('authorization') ?? ''
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : ''
  if (!bearer || !timingSafeEqual(configuredSecret, bearer)) {
    return machineJson({ error: { code: 'UNAUTHORIZED', message: 'Invalid gateway credential' } }, 401)
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 64 * 1024) {
    return machineJson({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Gateway payload is too large' } }, 413)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return machineJson({ error: { code: 'BAD_REQUEST', message: 'Body must be JSON' } }, 400)
  }

  const sourceIp =
    body && typeof body === 'object' && 'sourceIp' in body
      ? String((body as { sourceIp?: unknown }).sourceIp ?? 'unknown')
      : 'unknown'
  const endpointToken =
    body && typeof body === 'object' && 'token' in body
      ? String((body as { token?: unknown }).token ?? '')
      : ''
  const limited = await rateLimit(
    `fkweb-cloud:${sourceIp}:${sha256(endpointToken)}`,
    RATE_LIMITS.webhook.limit,
    RATE_LIMITS.webhook.windowSeconds,
  )
  if (!limited.ok) {
    return machineJson({ error: { code: 'RATE_LIMITED', message: 'Too many device packets' } }, 429)
  }

  try {
    const result = await ingestCloudFkWebPacket(body)
    if (!result.ok) {
      return machineJson({ data: null, error: { code: 'REJECTED', message: result.error } }, result.status)
    }
    if ('processing' in result && result.processing) {
      const { tenantId, eventId } = result.processing
      after(async () => {
        try {
          await processRawEvent(tenantId, eventId)
        } catch (error) {
          // The immutable event remains PENDING/FAILED and can be reprocessed.
          console.error('[fkweb-cloud] deferred attendance processing failed', error)
        }
      })
    }
    const publicResult = { ...result, processing: undefined }
    return machineJson({ data: publicResult, error: null }, 200)
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error &&
        (error as { name: string }).name === 'ZodError') {
      return machineJson({ error: { code: 'VALIDATION_ERROR', message: 'Invalid FKWeb gateway packet' } }, 422)
    }
    console.error('[fkweb-cloud] ingest failed', error)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Cloud biometric ingest failed' } }, 500)
  }
}
