import type { NextRequest } from 'next/server'
import { recordHeartbeat } from '@/server/modules/device-gateway/devices'
import { machineJson, requireConnector } from '@/server/modules/device-gateway/machine'

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireConnector(req)
  if ('error' in gate) return gate.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  try {
    const data = await recordHeartbeat(gate.auth, body)
    return machineJson({ data, error: null }, 200)
  } catch (err) {
    console.error('[device-gateway] heartbeat failed', err)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Heartbeat failed' } }, 500)
  }
}
