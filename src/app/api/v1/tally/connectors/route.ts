import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  createTallyPairingCode,
  listTallyConnectors,
  listTallyPairingCodes,
  revokeTallyConnector,
} from '@/server/modules/tally/pairing'

export const GET = route(async (_req, ctx) => {
  const [connectors, pairingCodes] = await Promise.all([
    listTallyConnectors(ctx),
    listTallyPairingCodes(ctx),
  ])
  return ok({ connectors, pairingCodes })
}, { permission: 'settings.integrations' })

export const POST = route(async (req, ctx) => {
  const body = await req.json().catch(() => ({}))
  if (body?.action === 'revoke' && body.connectorId) {
    return ok(await revokeTallyConnector(ctx, String(body.connectorId)))
  }
  return ok(await createTallyPairingCode(ctx, body))
}, { permission: 'settings.integrations' })
