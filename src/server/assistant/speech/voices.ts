import { env } from '@/lib/env'
import { DEFAULT_SPEECH_LANGUAGE, normaliseLanguageTag } from '@/lib/speech-languages'

/**
 * Azure Neural voice per assistant speech language.
 * Defaults favour clear Indian accents (en-IN Neerja).
 */
const AZURE_VOICE_BY_LANG: Record<string, string> = {
  'en-IN': 'en-IN-NeerjaNeural',
  'hi-IN': 'hi-IN-SwaraNeural',
  'mr-IN': 'mr-IN-AarohiNeural',
  'bn-IN': 'bn-IN-TanishaaNeural',
  'ta-IN': 'ta-IN-PallaviNeural',
  'te-IN': 'te-IN-ShrutiNeural',
  'gu-IN': 'gu-IN-DhwaniNeural',
  'kn-IN': 'kn-IN-SapnaNeural',
  'ml-IN': 'ml-IN-SobhanaNeural',
  'pa-IN': 'pa-IN-VaaniNeural',
  'ur-IN': 'ur-IN-GulNeural',
}

export function azureTtsConfigured(): boolean {
  const { AZURE_SPEECH_KEY, AZURE_SPEECH_REGION } = env()
  return Boolean(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION)
}

/** Whisper STT via the same OpenAI key the assistant chat uses. */
export function whisperSttConfigured(): boolean {
  const { AI_DRIVER, AI_API_KEY } = env()
  return AI_DRIVER === 'openai' && Boolean(AI_API_KEY)
}

export function resolveAzureVoice(languageTag: string | null | undefined): string {
  const tag = normaliseLanguageTag(languageTag)
  const override = env().AZURE_SPEECH_VOICE?.trim()
  if (override && (tag === 'en-IN' || tag === DEFAULT_SPEECH_LANGUAGE)) {
    return override
  }
  return AZURE_VOICE_BY_LANG[tag] ?? AZURE_VOICE_BY_LANG[DEFAULT_SPEECH_LANGUAGE]!
}

/** ISO-639-1 language hint for Whisper. */
export function whisperLanguageCode(languageTag: string | null | undefined): string {
  const tag = normaliseLanguageTag(languageTag)
  return tag.split('-')[0]?.toLowerCase() || 'en'
}
