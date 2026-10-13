import type { NextRequest } from 'next/server'
import { completeTallyCommand } from '@/server/modules/tally/commands'
import { machineJson, requireTallyConnector } from '@/server/modules/tally/machine'
import { ApiException } from '@/server/api/response'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const gate = await requireTallyConnector(req)
  if (!gate.ok) return gate.response

  try {
    const { id } = await context.params
    const body = await req.json()
    const data = await completeTallyCommand(gate.auth, id, body)
    return machineJson({ data, error: null }, 200)
  } catch (err) {
    if (err instanceof ApiException) {
      return machineJson({ error: { code: err.code, message: err.message } }, err.status)
    }
    console.error('[tally-connector] command result failed', err)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Could not store result' } }, 500)
  }
}
