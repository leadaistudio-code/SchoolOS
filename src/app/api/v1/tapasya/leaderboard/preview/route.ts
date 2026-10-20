import { route } from '@/server/api/handler'
import { ApiException, forbidden, ok } from '@/server/api/response'
import { demoLeaderboard } from '@/lib/tapasya/demo'
import { getGlobalSettings } from '@/server/modules/tapasya/config'

/**
 * GET /tapasya/leaderboard/preview — the labelled example board. Separate
 * endpoint, `demo: true` on every row, never stored, never merged with live data.
 */
export const GET = route(async (_req, ctx) => {
  if (!ctx.canAny('tapasya.use', 'tapasya.guardian', 'tapasya.teach', 'tapasya.manage')) throw forbidden()
  const settings = await getGlobalSettings()
  if (!settings.previewEnabled) throw new ApiException(404, 'PREVIEW_OFF', 'The example leaderboard is switched off.')
  return ok({ demo: true, label: 'Example only — not real students or scores', rows: demoLeaderboard() })
})
