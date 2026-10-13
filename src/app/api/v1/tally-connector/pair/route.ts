import type { NextRequest } from 'next/server'
import { pairTallyConnector } from '@/server/modules/tally/pairing'
import { machineJson } from '@/server/modules/tally/machine'
import { ApiException } from '@/server/api/response'

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json()
    const result = await pairTallyConnector(body)
    return machineJson({ data: result, error: null }, 200)
  } catch (err) {
    if (err instanceof ApiException) {
      return machineJson({ error: { code: err.code, message: err.message } }, err.status)
    }
    console.error('[tally-connector] pair failed', err)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Pairing failed' } }, 500)
  }
}
