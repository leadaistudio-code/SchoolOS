import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ApiException, ok } from '@/server/api/response'
import { assertFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { rateLimit } from '@/server/rate-limit'
import { normaliseLanguageTag } from '@/lib/speech-languages'
import { transcribeWithWhisper, whisperSttConfigured } from '@/server/assistant/speech'

/**
 * Whisper speech-to-text for Campus Assistant.
 * Client sends a short audio clip (webm/mp4/wav); returns { transcript }.
 */
export const POST = route(async (req: NextRequest, ctx) => {
  await assertFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)

  if (!whisperSttConfigured()) {
    throw new ApiException(
      503,
      'UNAVAILABLE',
      'Cloud listening needs OpenAI (AI_DRIVER=openai and AI_API_KEY).',
    )
  }

  const limited = await rateLimit(`assistant-stt:${ctx.tenant.id}:${ctx.user.userId}`, 40, 300)
  if (!limited.ok) {
    throw new ApiException(
      429,
      'RATE_LIMITED',
      'That is a lot of listening in a few minutes. Give it five and try again.',
    )
  }

  const form = await req.formData()
  const file = form.get('audio')
  if (!(file instanceof File)) {
    throw new ApiException(400, 'BAD_REQUEST', 'Attach an audio file as "audio".')
  }

  if (file.size < 256) {
    throw new ApiException(400, 'BAD_REQUEST', 'Audio clip was too short to understand.')
  }
  if (file.size > 4_000_000) {
    throw new ApiException(400, 'BAD_REQUEST', 'Audio clip is too large. Try a shorter question.')
  }

  const languageRaw = form.get('language')
  const language =
    typeof languageRaw === 'string' ? normaliseLanguageTag(languageRaw) : undefined

  const bytes = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || 'audio/webm'
  const filename = file.name || `speech.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`

  try {
    const { transcript } = await transcribeWithWhisper({
      bytes,
      filename,
      mimeType,
      language,
    })
    return ok({ transcript })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed'
    throw new ApiException(502, 'UPSTREAM', message)
  }
})
