import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getTallyStatus, updateTallyIntegration } from '@/server/modules/tally/settings'

export const GET = route(async (_req, ctx) => {
  return ok(await getTallyStatus(ctx))
})

export const PATCH = route(async (req, ctx) => {
  const body = await req.json()
  const data = await updateTallyIntegration(ctx, body)
  return ok({
    id: data.id,
    enabled: data.enabled,
    mode: data.mode,
    companyName: data.companyName,
    testMode: data.testMode,
    health: data.health,
  })
}, { permission: 'settings.integrations' })
