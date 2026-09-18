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
    model: 'whisper-1',
    language: whisperLanguageCode(input.language),
    response_format: 'json',
  })

  return { transcript: (result.text ?? '').trim() }
}
