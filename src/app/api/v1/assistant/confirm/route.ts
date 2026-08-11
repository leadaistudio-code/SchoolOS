import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assertFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { confirmDraft, confirmSchema } from '@/server/assistant/drafts'

/**
 * Approving a drafted action.
 *
 * A separate endpoint from the conversation on purpose: this is the request that
 * writes, and it is produced by the user clicking a button — never by the model
 * finishing a sentence. The model has no way to reach this route.
 *
 * `confirmDraft` re-checks ownership, expiry, single use, and the permission,
 * because a conversation can be minutes old and a permission can be revoked in
 * between.
 */
export const POST = route(
  async (req: NextRequest, ctx) => {
    await assertFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)
    const body = confirmSchema.parse(await req.json())
    return ok(await confirmDraft(ctx, body.draftId))
  },
  { permission: 'assistant.use', rateLimitKey: 'mutation' },
)
