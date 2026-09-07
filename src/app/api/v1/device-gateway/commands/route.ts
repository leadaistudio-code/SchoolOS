import type { NextRequest } from 'next/server'
import { claimPendingCommands } from '@/server/modules/device-gateway/commands'
import { machineJson, requireConnector } from '@/server/modules/device-gateway/machine'

export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireConnector(req)
  if ('error' in gate) return gate.error

  try {
    const data = await claimPendingCommands(gate.auth)
    return machineJson({ data, error: null }, 200)
  } catch (err) {
    console.error('[device-gateway] claim commands failed', err)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Could not load commands' } }, 500)
  }
}
