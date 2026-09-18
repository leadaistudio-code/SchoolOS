import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ApiException, ok } from '@/server/api/response'
import { assertFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { rateLimit } from '@/server/rate-limit'
import { formatForSpeech } from '@/lib/spoken-format'
import {
  azureTtsConfigured,
  synthesizeAzureSpeech,
  whisperSttConfigured,
} from '@/server/assistant/speech'

/**
 * Voice capability probe + Azure Neural TTS.
 *
 * GET  → { tts, stt } so the panel can pick cloud vs browser without guessing.
 * POST → MP3 for the spoken answer (Azure Neural Indian voices when configured).
 */

export const GET = route(async (_req, ctx) => {
  await assertFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)
  return ok({
    tts: azureTtsConfigured() ? 'azure' : 'browser',
    stt: whisperSttConfigured() ? 'whisper' : 'browser',
  })
})

const bodySchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  language: z.string().max(12).optional(),
})

export const POST = route(async (req: NextRequest, ctx) => {
  await assertFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST)

  if (!azureTtsConfigured()) {
    throw new ApiException(
      503,
      'UNAVAILABLE',
      'Cloud Indian-English voice is not configured on this deployment yet.',
    )
  }

  const limited = await rateLimit(`assistant-tts:${ctx.tenant.id}:${ctx.user.userId}`, 60, 300)
  if (!limited.ok) {
    throw new ApiException(
      429,
      'RATE_LIMITED',
      'That is a lot of speech in a few minutes. Give it five and try again.',
    )
  }

  const body = bodySchema.parse(await req.json())
  const spoken = formatForSpeech(
    body.text
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n{2,}/g, '. ')
      .trim(),
  )

  if (!spoken) {
    throw new ApiException(400, 'BAD_REQUEST', 'Nothing to speak.')
  }

  try {
    const { audio, contentType, voice } = await synthesizeAzureSpeech({
      text: spoken,
      language: body.language,
    })

    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Voice-Name': voice,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Speech synthesis failed'
    throw new ApiException(502, 'UPSTREAM', message)
  }
})
