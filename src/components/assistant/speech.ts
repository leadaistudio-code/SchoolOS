'use client'

/**
 * Voice input, using what the browser already has.
 *
 * `SpeechRecognition` is built into Chrome and Edge, costs nothing, needs no
 * dependency and no vendor. What it is not is local: **Chrome streams the audio
 * to Google's servers to transcribe it.** That is a third party receiving
 * whatever somebody says into a school system, so the microphone button says so
 * before it is used, and it stays off in browsers that do not support the API
 * rather than degrading to something worse.
 *
 * Everything here is a thin wrapper over the two vendor-prefixed globals, typed
 * because the DOM lib does not include them.
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

/**
 * Starts listening. Returns a stop function.
 *
 * `lang` defaults to Indian English, which materially improves recognition of
 * names, "lakh" and "Class 9-B" over the en-US default.
 */
export function listen(options: {
  lang?: string
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

  const recognition = new Recognition()
  recognition.lang = options.lang ?? 'en-IN'
  // Single utterance: a question, then send. Continuous dictation in a chat box
  // means the user has to find a stop button before anything happens.
  recognition.continuous = false
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
      'not-allowed': 'Microphone access was blocked. Allow it in your browser settings to speak.',
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
 * Reads an answer aloud.
 *
 * Opt-in per answer rather than automatic: an assistant that starts talking in a
 * staff room because somebody typed a question is a bad neighbour. Uses the
 * platform voice, so nothing is sent anywhere for playback.
 */
export function speak(text: string, lang = 'en-IN') {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = 1.02
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
}
