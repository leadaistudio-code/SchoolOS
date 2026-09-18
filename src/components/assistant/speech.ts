'use client'

import { formatForSpeech } from '@/lib/spoken-format'
import { DEFAULT_SPEECH_LANGUAGE } from '@/lib/speech-languages'

/**
 * Voice input and output for the campus assistant.
 *
 * Preferred path (when the deployment is configured):
 *   - Speak: Azure Neural TTS (Indian English Neerja / language-matched voices)
 *   - Listen: OpenAI Whisper via short recorded clips + local VAD
 *
 * Fallback: browser SpeechRecognition + speechSynthesis (Chrome streams mic
 * audio to Google — the panel footer still says so when that path is active).
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

export type SpeechCapabilities = {
  tts: 'azure' | 'browser'
  stt: 'whisper' | 'browser'
}

const STOP_PHRASES = [
  'stop',
  "that's all",
  'thats all',
  'thank you',
  'thanks',
  'bas',
  'band karo',
  'enough',
]

/** Preferred Indian English voice name fragments (Windows / Chrome / Edge). */
const INDIAN_ENGLISH_VOICE_HINTS = [
  'ravi',
  'heera',
  'neerja',
  'prabhat',
  'indian english',
  'english (india)',
  'english india',
  'en-in',
]

let capabilities: SpeechCapabilities = { tts: 'browser', stt: 'browser' }
let capabilitiesLoaded = false

export function getSpeechCapabilities(): SpeechCapabilities {
  return capabilities
}

export function setSpeechCapabilities(next: SpeechCapabilities) {
  capabilities = next
  capabilitiesLoaded = true
}

/** Fetch whether Azure Neural + Whisper are live for this deployment. */
export async function loadSpeechCapabilities(): Promise<SpeechCapabilities> {
  try {
    const response = await fetch('/api/v1/assistant/speech')
    if (!response.ok) return capabilities
    const body = (await response.json()) as {
      data?: { tts?: string; stt?: string }
    }
    const next: SpeechCapabilities = {
      tts: body.data?.tts === 'azure' ? 'azure' : 'browser',
      stt: body.data?.stt === 'whisper' ? 'whisper' : 'browser',
    }
    setSpeechCapabilities(next)
    return next
  } catch {
    return capabilities
  }
}

export function speechCapabilitiesReady(): boolean {
  return capabilitiesLoaded
}

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

function mediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

export function speechSupported(): boolean {
  if (capabilities.stt === 'whisper' && mediaRecorderSupported()) return true
  return constructor() !== null
}

let cloudAudio: HTMLAudioElement | null = null
let cloudSpeaking = false

export function isSpeaking(): boolean {
  if (cloudSpeaking) return true
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  return window.speechSynthesis.speaking || window.speechSynthesis.pending
}

function scoreIndianEnglishVoice(voice: SpeechSynthesisVoice, lang: string): number {
  const want = lang.toLowerCase()
  const prefix = want.split('-')[0] ?? 'en'
  const voiceLang = voice.lang.toLowerCase()
  const name = voice.name.toLowerCase()
  let score = 0

  if (voiceLang === want) score += 120
  else if (voiceLang === 'en-in' || voiceLang.startsWith('en-in')) score += 110
  else if (name.includes('india') || name.includes('indian')) score += 90
  else if (voiceLang.startsWith(`${prefix}-`)) score += 25
  else if (voiceLang.startsWith(prefix)) score += 10

  for (const hint of INDIAN_ENGLISH_VOICE_HINTS) {
    if (name.includes(hint) || voiceLang.includes(hint)) score += 35
  }

  if (name.includes('natural') || name.includes('neural') || name.includes('online')) score += 12
  if (name.includes('heera') || name.includes('neerja')) score += 8

  if (want === 'en-in' || want.startsWith('en-in')) {
    if (voiceLang === 'en-gb' || voiceLang === 'en-us' || voiceLang === 'en-au') score -= 25
    if (name.includes('british') || name.includes('american') || name.includes('australian')) score -= 20
  }

  if (voice.default) score += 5
  return score
}

/** Prefer a neutral Indian English voice when the browser has one. */
export function pickVoice(lang = DEFAULT_SPEECH_LANGUAGE): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null

  const ranked = [...voices]
    .map((voice) => ({ voice, score: scoreIndianEnglishVoice(voice, lang) }))
    .sort((a, b) => b.score - a.score)

  return ranked[0]?.voice ?? null
}

export type SpeakOptions = {
  lang?: string
  onStart?: () => void
  onEnd?: () => void
}

let activeCancel: (() => void) | null = null

function prepareSpokenText(text: string): string {
  return formatForSpeech(
    text
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n{2,}/g, '. ')
      .trim(),
  )
}

function stopCloudAudio() {
  cloudSpeaking = false
  if (!cloudAudio) return
  try {
    cloudAudio.pause()
    cloudAudio.removeAttribute('src')
    cloudAudio.load()
  } catch {
    // Ignore teardown races.
  }
  cloudAudio = null
}

async function speakAzure(text: string, opts: SpeakOptions): Promise<() => void> {
  let cancelled = false
  let objectUrl: string | null = null

  const cancel = () => {
    cancelled = true
    stopCloudAudio()
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
    if (activeCancel === cancel) activeCancel = null
  }
  activeCancel = cancel

  try {
    const response = await fetch('/api/v1/assistant/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: opts.lang ?? DEFAULT_SPEECH_LANGUAGE }),
    })

    if (!response.ok) {
      throw new Error('Azure TTS request failed')
    }

    if (cancelled) return cancel

    const blob = await response.blob()
    if (cancelled) return cancel

    objectUrl = URL.createObjectURL(blob)
    const audio = new Audio(objectUrl)
    cloudAudio = audio
    cloudSpeaking = true

    audio.onplay = () => {
      if (!cancelled) opts.onStart?.()
    }
    audio.onended = () => {
      cloudSpeaking = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = null
      if (cloudAudio === audio) cloudAudio = null
      if (activeCancel === cancel) activeCancel = null
      if (!cancelled) opts.onEnd?.()
    }
    audio.onerror = () => {
      cloudSpeaking = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = null
      if (cloudAudio === audio) cloudAudio = null
      if (activeCancel === cancel) activeCancel = null
      if (!cancelled) opts.onEnd?.()
    }

    await audio.play()
  } catch {
    cancel()
    // Fall through to browser TTS so the user still hears something.
    return speakBrowser(text, opts)
  }

  return cancel
}

function speakBrowser(text: string, opts: SpeakOptions): () => void {
  const lang = opts.lang ?? DEFAULT_SPEECH_LANGUAGE

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    opts.onEnd?.()
    return () => {}
  }

  window.speechSynthesis.cancel()
  stopCloudAudio()

  const cleaned = prepareSpokenText(text)
  if (!cleaned) {
    opts.onEnd?.()
    return () => {}
  }

  let cancelled = false
  const cancel = () => {
    cancelled = true
    window.speechSynthesis.cancel()
    if (activeCancel === cancel) activeCancel = null
  }
  activeCancel = cancel

  const startUtterance = () => {
    if (cancelled) return

    const utterance = new SpeechSynthesisUtterance(cleaned)
    utterance.lang = lang
    utterance.rate = 0.96
    utterance.pitch = 1
    const voice = pickVoice(lang)
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang || lang
    }

    utterance.onstart = () => {
      if (!cancelled) opts.onStart?.()
    }
    utterance.onend = () => {
      if (activeCancel === cancel) activeCancel = null
      if (!cancelled) opts.onEnd?.()
    }
    utterance.onerror = () => {
      if (activeCancel === cancel) activeCancel = null
      if (!cancelled) opts.onEnd?.()
    }

    window.speechSynthesis.speak(utterance)
  }

  if (window.speechSynthesis.getVoices().length === 0) {
    const resume = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', resume)
      startUtterance()
    }
    window.speechSynthesis.addEventListener('voiceschanged', resume)
    window.setTimeout(resume, 400)
  } else {
    startUtterance()
  }

  return cancel
}

/**
 * Reads text aloud. Prefers Azure Neural Indian voices when configured.
 * Returns a cancel function; calling again cancels the previous utterance first.
 */
export function speak(text: string, options: SpeakOptions | string = DEFAULT_SPEECH_LANGUAGE): () => void {
  const opts: SpeakOptions = typeof options === 'string' ? { lang: options } : options

  stopSpeaking()

  const cleaned = prepareSpokenText(text)
  if (!cleaned) {
    opts.onEnd?.()
    return () => {}
  }

  if (capabilities.tts === 'azure') {
    let cancelledEarly = false
    let innerCancel: (() => void) | null = null
    const cancel = () => {
      cancelledEarly = true
      innerCancel?.()
      stopCloudAudio()
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      if (activeCancel === cancel) activeCancel = null
    }
    activeCancel = cancel

    void speakAzure(cleaned, opts).then((stop) => {
      if (cancelledEarly) {
        stop()
        return
      }
      innerCancel = stop
      activeCancel = () => {
        cancelledEarly = true
        stop()
      }
    })

    return cancel
  }

  return speakBrowser(cleaned, opts)
}

/** Starts read-aloud, or stops it if something is already speaking. */
export function toggleSpeak(
  text: string,
  options: SpeakOptions | string = DEFAULT_SPEECH_LANGUAGE,
): 'started' | 'stopped' {
  if (isSpeaking()) {
    stopSpeaking()
    return 'stopped'
  }
  speak(text, options)
  return 'started'
}

export function stopSpeaking() {
  activeCancel?.()
  activeCancel = null
  stopCloudAudio()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

/**
 * Open the mic only to cut TTS as soon as the user starts talking.
 * Used for manual "Read aloud" when handsfree barge-in is not already running.
 */
export function listenToInterruptSpeech(options: {
  lang?: string
  onInterrupt: () => void
}): () => void {
  let interrupted = false
  const stop = listen({
    lang: options.lang ?? DEFAULT_SPEECH_LANGUAGE,
    continuous: true,
    onResult: ({ transcript }) => {
      if (interrupted) return
      if (!transcript.trim()) return
      interrupted = true
      options.onInterrupt()
      stop()
    },
    onError: () => {},
    onEnd: () => {},
  })
  return stop
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

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

/**
 * Whisper path: record immediately on listen, finish on silence after speech
 * or when the caller stops (click Listen again). Much more reliable than
 * waiting for VAD before the recorder starts.
 */
function listenWhisper(options: {
  lang?: string
  continuous?: boolean
  onResult: (result: SpeechResult) => void
  onError: (message: string) => void
  onEnd: () => void
}): () => void {
  let stopped = false
  let stream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let speechStarted = false
  let silenceMs = 0
  let voicedMs = 0
  let recordingMs = 0
  let raf = 0
  let lastTick = 0
  let bargeSignalled = false
  let finishing = false

  // Lower threshold + require sustained voice so laptop fans don't trip it,
  // but still pick up normal speech close to the mic.
  const SPEECH_RMS = 0.012
  const START_MS = 180
  const END_SILENCE_MS = 1_100
  const MAX_UTTERANCE_MS = 25_000
  const MIN_BLOB_BYTES = 1_200

  const cleanupGraph = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    try {
      source?.disconnect()
    } catch {
      /* ignore */
    }
    source = null
    analyser = null
    if (audioContext) {
      void audioContext.close().catch(() => {})
      audioContext = null
    }
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      stream = null
    }
  }

  const startRecorder = () => {
    if (!stream || stopped || mediaRecorder) return
    const mime = pickRecorderMime()
    try {
      mediaRecorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
    } catch {
      mediaRecorder = new MediaRecorder(stream)
    }
    chunks = []
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    try {
      mediaRecorder.start(200)
    } catch {
      /* already started */
    }
  }

  const collectBlob = (): Promise<Blob> =>
    new Promise((resolve) => {
      const type = mediaRecorder?.mimeType || chunks[0]?.type || 'audio/webm'
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(new Blob(chunks, { type }))
        return
      }
      mediaRecorder.onstop = () => {
        resolve(new Blob(chunks, { type: mediaRecorder?.mimeType || type }))
      }
      try {
        mediaRecorder.requestData?.()
      } catch {
        /* optional */
      }
      try {
        mediaRecorder.stop()
      } catch {
        resolve(new Blob(chunks, { type }))
      }
    })

  const finishUtterance = async (reason: 'silence' | 'stop' | 'max') => {
    if (finishing || stopped) return
    finishing = true
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const blob = await collectBlob()
    mediaRecorder = null
    chunks = []

    if (stopped && reason !== 'stop') return

    const tooShort = blob.size < MIN_BLOB_BYTES || (!speechStarted && reason !== 'stop')
    if (tooShort && reason !== 'stop') {
      // Continuous handsfree: keep listening for the next utterance.
      if (options.continuous && !stopped && stream) {
        speechStarted = false
        bargeSignalled = false
        silenceMs = 0
        voicedMs = 0
        recordingMs = 0
        finishing = false
        startRecorder()
        lastTick = performance.now()
        raf = requestAnimationFrame(tick)
        return
      }
      cleanupGraph()
      if (!stopped) options.onEnd()
      return
    }

    if (tooShort && reason === 'stop') {
      cleanupGraph()
      stopped = true
      options.onEnd()
      return
    }

    options.onResult({ transcript: 'Transcribing…', final: false })

    try {
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const form = new FormData()
      form.append('audio', blob, `speech.${extension}`)
      form.append('language', options.lang ?? DEFAULT_SPEECH_LANGUAGE)
      const response = await fetch('/api/v1/assistant/speech/transcribe', {
        method: 'POST',
        body: form,
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message || 'Could not understand that. Try again.')
      }
      const body = (await response.json()) as { data?: { transcript?: string } }
      const transcript = body.data?.transcript?.trim() ?? ''
      if (transcript && !stopped) {
        options.onResult({ transcript, final: true })
      } else if (!transcript && !stopped) {
        options.onError('I did not catch that. Click Listen and try again.')
      }
    } catch (err) {
      if (!stopped) {
        options.onError(err instanceof Error ? err.message : 'Could not understand that.')
      }
    }

    cleanupGraph()
    stopped = true
    finishing = false
    options.onEnd()
  }

  const tick = (now: number) => {
    if (stopped || finishing || !analyser) return
    const elapsed = lastTick ? now - lastTick : 16
    lastTick = now
    recordingMs += elapsed

    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i += 1) {
      const sample = data[i] ?? 0
      sum += sample * sample
    }
    const rms = Math.sqrt(sum / data.length)

    if (rms >= SPEECH_RMS) {
      voicedMs += elapsed
      silenceMs = 0
      if (!speechStarted && voicedMs >= START_MS) {
        speechStarted = true
        if (!bargeSignalled) {
          bargeSignalled = true
          // Energy marker for barge-in / UI — not real words.
          options.onResult({
            transcript: options.continuous ? '…' : 'Listening…',
            final: false,
          })
        }
      }
    } else if (speechStarted) {
      silenceMs += elapsed
      if (silenceMs >= END_SILENCE_MS) {
        void finishUtterance('silence')
        return
      }
    } else {
      voicedMs = Math.max(0, voicedMs - elapsed)
    }

    // Click-to-talk with no speech yet: keep waiting until max, then stop cleanly.
    if (!speechStarted && recordingMs >= MAX_UTTERANCE_MS) {
      void finishUtterance('max')
      return
    }

    if (speechStarted && recordingMs >= MAX_UTTERANCE_MS) {
      void finishUtterance('max')
      return
    }

    raf = requestAnimationFrame(tick)
  }

  const stop = () => {
    if (stopped && !finishing) return
    // Second click / cancel: finish what we have instead of throwing it away.
    if (!finishing) {
      void finishUtterance('stop')
      return
    }
    stopped = true
    cleanupGraph()
  }

  void (async () => {
    if (!window.isSecureContext) {
      options.onError(
        'Voice needs a secure connection. Open the portal over https:// (or on localhost) to use the microphone.',
      )
      options.onEnd()
      return
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch {
      options.onError(
        'Microphone access was refused. Allow the microphone for this site — in Chrome, the icon at the right of the address bar.',
      )
      options.onEnd()
      return
    }

    if (stopped) {
      cleanupGraph()
      return
    }

    audioContext = new AudioContext()
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume()
      } catch {
        /* continue anyway */
      }
    }
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048
    source = audioContext.createMediaStreamSource(stream)
    source.connect(analyser)

    // Record from the first moment — do not wait for VAD to arm the mic.
    startRecorder()
    // Only announce Listening for click-to-talk. Continuous/barge-in must not
    // emit a fake transcript or it will cut Azure TTS the instant the mic opens.
    if (!options.continuous) {
      options.onResult({ transcript: 'Listening…', final: false })
    }
    lastTick = performance.now()
    raf = requestAnimationFrame(tick)
  })()

  return stop
}

function listenBrowser(options: {
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
  recognition.lang = options.lang ?? DEFAULT_SPEECH_LANGUAGE
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
      'no-speech': '',
      network: 'Speech recognition needs a network connection.',
      aborted: '',
    }
    const message = messages[event.error] ?? 'The microphone stopped working. Try typing instead.'
    if (message) options.onError(message)
    else options.onEnd()
  }

  recognition.onend = options.onEnd

  try {
    recognition.start()
  } catch {
    // Calling start() twice throws; treat it as already listening.
  }

  return () => recognition.abort()
}

export function listen(options: {
  lang?: string
  continuous?: boolean
  onResult: (result: SpeechResult) => void
  onError: (message: string) => void
  onEnd: () => void
}): () => void {
  if (capabilities.stt === 'whisper' && mediaRecorderSupported()) {
    return listenWhisper(options)
  }
  return listenBrowser(options)
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
