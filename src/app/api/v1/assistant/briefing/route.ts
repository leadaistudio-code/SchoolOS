import { route } from '@/server/api/handler'
import { assertFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { getAssistantBriefing } from '@/server/assistant/briefing'

/**
 * GET /api/v1/assistant/briefing
 *
 * Role-aware greeting and today's top three actionable items for the welcome
 * screen. Refetched when the panel opens so counts stay current.
 */
export const GET = route(
  async (_req, ctx) => {
    await assertFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)
    const briefing = await getAssistantBriefing(ctx)
    return Response.json(briefing)
  },
  { permission: 'assistant.use', rateLimitKey: 'api' },
)
