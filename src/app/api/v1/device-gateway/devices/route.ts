import type { NextRequest } from 'next/server'
import { upsertDeviceFromConnector } from '@/server/modules/device-gateway/devices'
import { machineJson, requireConnector } from '@/server/modules/device-gateway/machine'
import { ApiException } from '@/server/api/response'

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireConnector(req)
  if ('error' in gate) return gate.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return machineJson({ error: { code: 'BAD_REQUEST', message: 'Body must be JSON' } }, 400)
  }

  try {
    const data = await upsertDeviceFromConnector(gate.auth, body)
    return machineJson({ data, error: null }, 200)
  } catch (err) {
    if (err instanceof ApiException) {
      return machineJson({ error: { code: err.code, message: err.message } }, err.status)
    }
    console.error('[device-gateway] device upsert failed', err)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Device registration failed' } }, 500)
  }
}
