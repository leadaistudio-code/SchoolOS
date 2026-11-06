import OpenAI, { toFile } from 'openai'
import { env } from '@/lib/env'
import { whisperLanguageCode, whisperSttConfigured } from './voices'

/**
 * Transcribe spoken audio with OpenAI Whisper (same AI_API_KEY as chat).
 */
export async function transcribeWithWhisper(input: {
  bytes: Buffer
  filename: string
  mimeType: string
  language?: string | null
  /** Let Whisper detect the language, for speakers who mix Hindi and English. */
  autoDetect?: boolean
  /** Transcription model; defaults to whisper-1. */
  model?: string
}): Promise<{ transcript: string }> {
  if (!whisperSttConfigured()) {
    throw new Error('Whisper speech-to-text needs AI_DRIVER=openai and AI_API_KEY.')
  }

  const { AI_API_KEY, AI_BASE_URL } = env()
  const client = new OpenAI({
    apiKey: AI_API_KEY!,
    ...(AI_BASE_URL ? { baseURL: AI_BASE_URL } : {}),
  })

  const file = await toFile(input.bytes, input.filename || 'speech.webm', {
    type: input.mimeType || 'audio/webm',
  })

  const result = await client.audio.transcriptions.create({
    file,
    model: input.model ?? 'whisper-1',
    ...(input.autoDetect ? {} : { language: whisperLanguageCode(input.language) }),
    response_format: 'json',
  })

  return { transcript: (result.text ?? '').trim() }
}
