'use client'

/**
 * Voice input and output for the campus assistant.
 *
 * Chrome streams audio to Google's servers for transcription — the panel footer
 * says so before anyone uses the mic.
 */

type SpeechResult = { transcript: string; final: boolean }

type RecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type RecognitionConstructor = new () => RecognitionLike

const STOP_PHRASES = [
  'stop',
  'that\'s all',
  'thats all',
  'thank you',
  'thanks',
  'bas',
  'band karo',
  'enough',
]

export function isStopPhrase(text: string): boolean {
  const normalised = text.trim().toLowerCase().replace(/[.,!?]/g, '')
  return STOP_PHRASES.some(
    (phrase) => normalised === phrase || normalised.startsWith(`${phrase} `) || normalised.endsWith(` ${phrase}`),
  )
}

function constructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechSupported(): boolean {
  return constructor() !== null
}

/** Prefer an Indian English voice when the browser has one. */
export function pickVoice(lang = 'en-IN'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  const prefix = lang.split('-')[0]?.toLowerCase() ?? 'en'
  const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase())
  if (exact) return exact
  const regional = voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
  return regional ?? voices[0] ?? null
}

export type SpeakOptions = {
  lang?: string
  onStart?: () => void
  onEnd?: () => void
}

/**
 * Reads text aloud. Returns a cancel function.
 * Strips markdown-ish noise so TTS does not read asterisks aloud.
 */
export function speak(text: string, options: SpeakOptions | string = 'en-IN'): () => void {
  const opts: SpeakOptions = typeof options === 'string' ? { lang: options } : options
  const lang = opts.lang ?? 'en-IN'

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    opts.onEnd?.()
    return () => {}
  }

  window.speechSynthesis.cancel()

  const cleaned = text
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n{2,}/g, '. ')
    .trim()

  if (!cleaned) {
    opts.onEnd?.()
    return () => {}
  }

  const utterance = new SpeechSynthesisUtterance(cleaned)
  utterance.lang = lang
  utterance.rate = 0.98
  const voice = pickVoice(lang)
  if (voice) utterance.voice = voice

  utterance.onstart = () => opts.onStart?.()
  utterance.onend = () => opts.onEnd?.()
  utterance.onerror = () => opts.onEnd?.()

  window.speechSynthesis.speak(utterance)
  return () => window.speechSynthesis.cancel()
}

export function stopSpeaking() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
}

/**
 * Request microphone access while a user gesture is still active (panel open click).
 * Browsers block SpeechRecognition.start() without permission / gesture.
 */
export async function primeMicrophone(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
    return true
  } catch {
    return false
  }
}

export function listen(options: {
  lang?: string
  continuous?: boolean
  onResult: (result: SpeechResult) => void
  onError: (message: string) => void
  onEnd: () => void
}): () => void {
  const Recognition = constructor()
  if (!Recognition) {
    options.onError('This browser cannot listen. Try Chrome or Edge, or type your question.')
    options.onEnd()
    return () => {}
  }

  if (!window.isSecureContext) {
    options.onError(
      'Voice needs a secure connection. Open the portal over https:// (or on localhost) to use the microphone.',
    )
    options.onEnd()
    return () => {}
  }

  const recognition = new Recognition()
  recognition.lang = options.lang ?? 'en-IN'
  recognition.continuous = options.continuous ?? false
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1]
    if (!last) return
    const alternative = last[0]
    if (!alternative) return
    options.onResult({ transcript: alternative.transcript, final: last.isFinal })
  }

  recognition.onerror = (event) => {
    const messages: Record<string, string> = {
      'not-allowed':
        'Microphone access was refused. Allow the microphone for this site — in Chrome, the icon at the right of the address bar.',
      'service-not-allowed': 'Microphone access was blocked by your browser or your school network.',
      'no-speech': 'I did not catch anything. Try again, or type it.',
      network: 'Speech recognition needs a network connection.',
      aborted: '',
    }
    const message = messages[event.error] ?? 'The microphone stopped working. Try typing instead.'
    if (message) options.onError(message)
  }

  recognition.onend = options.onEnd

  try {
    recognition.start()
  } catch {
    // Calling start() twice throws; treat it as already listening.
  }

  return () => recognition.abort()
}

/**
 * Handsfree listening: continuous mode with accumulated transcript.
 * Sends on final pause; caller restarts via onEnd when session stays active.
 */
export function listenContinuous(options: {
  lang?: string
  onTranscript: (transcript: string, interim: boolean) => void
  onFinal: (transcript: string) => void
  onError: (message: string) => void
  onEnd: () => void
}): () => void {
  let accumulated = ''

  return listen({
    lang: options.lang,
    continuous: true,
    onResult: ({ transcript, final }) => {
      if (final) {
        accumulated = accumulated ? `${accumulated} ${transcript}`.trim() : transcript.trim()
        if (accumulated) {
          options.onFinal(accumulated)
          accumulated = ''
        }
      } else {
        const preview = accumulated ? `${accumulated} ${transcript}`.trim() : transcript
        options.onTranscript(preview, true)
      }
    },
    onError: options.onError,
    onEnd: options.onEnd,
  })
}

/** Preload voices — Chrome populates the list asynchronously. */
export function preloadVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices()
  }
}
