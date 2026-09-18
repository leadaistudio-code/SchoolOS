import { env } from '@/lib/env'
import { azureTtsConfigured, resolveAzureVoice } from './voices'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Synthesise speech with Azure Neural TTS.
 * Returns MP3 bytes suitable for immediate browser playback.
 */
export async function synthesizeAzureSpeech(input: {
  text: string
  language?: string | null
}): Promise<{ audio: Buffer; contentType: string; voice: string }> {
  if (!azureTtsConfigured()) {
    throw new Error('Azure Speech is not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.')
  }

  const { AZURE_SPEECH_KEY, AZURE_SPEECH_REGION } = env()
  const voice = resolveAzureVoice(input.language)
  const lang = voice.split('-').slice(0, 2).join('-') || 'en-IN'
  const cleaned = input.text.trim().slice(0, 4_000)
  if (!cleaned) {
    throw new Error('Nothing to speak.')
  }

  const ssml = `<speak version="1.0" xml:lang="${lang}">
  <voice name="${voice}">
    <prosody rate="0.96">${escapeXml(cleaned)}</prosody>
  </voice>
</speak>`

  const endpoint = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY!,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'MyCampusView-Assistant',
    },
    body: ssml,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Azure TTS failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    )
  }

  const audio = Buffer.from(await response.arrayBuffer())
  return { audio, contentType: 'audio/mpeg', voice }
}
