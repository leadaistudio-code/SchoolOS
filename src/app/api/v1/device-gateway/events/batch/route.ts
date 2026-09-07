import type { NextRequest } from 'next/server'
import { ingestEventBatch } from '@/server/modules/device-gateway/events'
import { machineJson, requireConnector } from '@/server/modules/device-gateway/machine'

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireConnector(req)
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return machineJson({ error: { code: 'BAD_REQUEST', message: 'Body must be JSON' } }, 400)
  }

  try {
    const data = await ingestEventBatch(gate.auth, body)
    return machineJson({ data, error: null }, 202)
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ZodError') {
      return machineJson({ error: { code: 'VALIDATION_ERROR', message: 'Invalid event batch' } }, 422)
    }
    console.error('[device-gateway] event batch failed', err)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Event ingest failed' } }, 500)
  }
}
