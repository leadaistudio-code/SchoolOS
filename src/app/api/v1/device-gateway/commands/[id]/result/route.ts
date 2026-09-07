import type { NextRequest } from 'next/server'
import { reportCommandResult } from '@/server/modules/device-gateway/commands'
import { machineJson, requireConnector } from '@/server/modules/device-gateway/machine'
import { ApiException } from '@/server/api/response'

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, routeCtx: RouteCtx): Promise<Response> {
  const gate = await requireConnector(req)
  if (gate.ok === false) {
    return gate.response
  }

  const { id } = await routeCtx.params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return machineJson({ error: { code: 'BAD_REQUEST', message: 'Body must be JSON' } }, 400)
  }

  try {
    const data = await reportCommandResult(gate.auth, id, body)
    return machineJson({ data, error: null }, 200)
  } catch (err) {
    if (err instanceof ApiException) {
      return machineJson({ error: { code: err.code, message: err.message } }, err.status)
    }
    console.error('[device-gateway] command result failed', err)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Could not store command result' } }, 500)
  }
}
