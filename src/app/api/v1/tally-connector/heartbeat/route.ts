import type { NextRequest } from 'next/server'
import { touchTallyConnector } from '@/server/modules/tally/auth'
import { heartbeatSchema } from '@/server/modules/tally/schema'
import { machineJson, requireTallyConnector } from '@/server/modules/tally/machine'
import { tenantDb } from '@/server/db/tenant-client'

export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireTallyConnector(req)
  if (!gate.ok) return gate.response

  try {
    const body = heartbeatSchema.parse(await req.json().catch(() => ({})))
    await touchTallyConnector(gate.auth.tenantId, gate.auth.connectorId, {
      version: body.connectorVersion,
      hostname: body.hostname,
      osInfo: body.osInfo,
      pendingJobs: body.pendingJobs,
      tallyHost: body.tallyHost,
      tallyPort: body.tallyPort,
    })

    if (body.tallyReachable !== undefined || body.companyName !== undefined) {
      const db = tenantDb(gate.auth.tenantId)
      await db.tallyIntegration.update({
        where: { id: gate.auth.integrationId },
        data: {
          lastConnectionAt: new Date(),
          health: body.tallyReachable === false ? 'OFFLINE' : 'HEALTHY',
          lastConnectionError:
            body.tallyReachable === false
              ? 'Connector reports Tally unreachable'
              : null,
          ...(body.companyName ? { companyName: body.companyName } : {}),
        },
      })
    }

    return machineJson({ data: { ok: true }, error: null }, 200)
  } catch (err) {
    console.error('[tally-connector] heartbeat failed', err)
    return machineJson({ error: { code: 'SERVER_ERROR', message: 'Heartbeat failed' } }, 500)
  }
}
