import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ApiException, ok } from '@/server/api/response'
import { rateLimit } from '@/server/rate-limit'
import { extractVisitDraft, transcribeVisitNote } from '@/server/modules/platform/growth/voice'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/v1/platform/crm/voice-capture
 * multipart `audio` (a recorded voice note) or JSON `{ transcript }`;
 * returns `{ transcript, draft, matches }` for the rep to review. Saves nothing.
 */
export const POST = platformRoute(
  async (req: NextRequest, ctx) => {
    const limited = await rateLimit(`crm-voice:${ctx.user.userId}`, 30, 3600)
    if (!limited.ok) {
      throw new ApiException(429, 'RATE_LIMITED', 'Too many voice notes this hour. Please fill the form by hand for now.')
    }

    let transcript: string
    if ((req.headers.get('content-type') ?? '').includes('application/json')) {
      const body = (await req.json().catch(() => ({}))) as { transcript?: unknown }
      transcript = typeof body.transcript === 'string' ? body.transcript : ''
    } else {
      const audio = (await req.formData()).get('audio')
      if (!(audio instanceof File)) throw new ApiException(400, 'BAD_REQUEST', 'Attach the recording as "audio".')
      transcript = await transcribeVisitNote(audio)
    }

    return ok(await extractVisitDraft(ctx, transcript))
  },
  { permission: 'platform.crm_create' },
)
