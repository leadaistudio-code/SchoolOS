import type { NextRequest } from 'next/server'
import { claimTallyCommands } from '@/server/modules/tally/commands'
import { touchTallyConnector } from '@/server/modules/tally/auth'
import { machineJson, requireTallyConnector } from '@/server/modules/tally/machine'

export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireTallyConnector(req)
  if (!gate.ok) return gate.response

  try {
    await touchTallyConnector(gate.auth.tenantId, gate.auth.connectorId, {})
    const data = await claimTallyCommands(gate.auth)
    return machineJson({ data, error: null }, 200)
  } catch (err) {
    console.error('[tally-connector] claim commands failed', err)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Could not load commands' } }, 500)
  }
}
