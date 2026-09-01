import * as Speech from 'expo-speech'
import Voice, { type SpeechResultsEvent, type SpeechErrorEvent } from '@react-native-voice/voice'
import { Platform } from 'react-native'

const STOP_PHRASES = ['stop', "that's all", 'thank you', 'thanks', 'bas', 'enough']

export function isStopPhrase(text: string): boolean {
  const normalised = text.trim().toLowerCase().replace(/[.,!?]/g, '')
  return STOP_PHRASES.some(
    (phrase) => normalised === phrase || normalised.startsWith(`${phrase} `) || normalised.endsWith(` ${phrase}`),
  )
}

export async function speak(text: string, onDone?: () => void) {
  const cleaned = text
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n{2,}/g, '. ')
    .trim()
  if (!cleaned) {
    onDone?.()
    return
  }
  Speech.stop()
  await new Promise<void>((resolve) => {
    Speech.speak(cleaned, {
      language: 'en-IN',
      rate: Platform.OS === 'ios' ? 0.5 : 0.95,
      onDone: () => {
        onDone?.()
        resolve()
      },
      onStopped: () => {
        onDone?.()
        resolve()
      },
    })
  })
}

export function stopSpeaking() {
  Speech.stop()
}

export type VoiceListenHandlers = {
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
}

let latestTranscript = ''

export function startListening(handlers: VoiceListenHandlers) {
  latestTranscript = ''
  Voice.removeAllListeners()

  Voice.onSpeechResults = (event: SpeechResultsEvent) => {
    const text = event.value?.[0] ?? ''
    if (!text) return
    latestTranscript = text
    handlers.onPartial(text)
  }

  Voice.onSpeechEnd = () => {
    const text = latestTranscript.trim()
    latestTranscript = ''
    if (text) handlers.onFinal(text)
  }

  Voice.onSpeechError = (event: SpeechErrorEvent) => {
    const message = event.error?.message ?? ''
    if (message && !message.toLowerCase().includes('no match')) {
      handlers.onError(message)
    }
  }

  return Voice.start(Platform.OS === 'ios' ? 'en-IN' : 'en-IN').catch((err: Error) => {
    handlers.onError(err.message || 'Could not start listening')
  })
}

export async function stopListening() {
  try {
    await Voice.stop()
    await Voice.cancel()
  } catch {
    // Already stopped.
  }
  latestTranscript = ''
}

export function destroyVoice() {
  void Voice.destroy().then(Voice.removeAllListeners)
}
