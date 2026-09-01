'use client'

import * as React from 'react'
import {
  isStopPhrase,
  listen,
  speak,
  speechSupported,
  stopSpeaking,
  preloadVoices,
} from './speech'

export type VoiceSessionPhase = 'idle' | 'listening' | 'processing' | 'speaking'

export type VoiceSessionOptions = {
  enabled: boolean
  language: string
  active: boolean
  greetingDone: boolean
  busy: boolean
  onTranscript: (text: string) => void
  onQuestion: (text: string) => void
  onStopSession: () => void
  onPhaseChange?: (phase: VoiceSessionPhase) => void
  onError?: (message: string) => void
}

const HANDSFREE_KEY = 'mycampusview.assistant.handsfree'

export function readHandsfreePreference(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const stored = window.localStorage.getItem(HANDSFREE_KEY)
    if (stored === 'false') return false
    return true
  } catch {
    return true
  }
}

export function writeHandsfreePreference(enabled: boolean) {
  try {
    window.localStorage.setItem(HANDSFREE_KEY, enabled ? 'true' : 'false')
  } catch {
    // Not worth interrupting anybody over.
  }
}

/**
 * Handsfree conversation loop: listen → process (caller) → speak answer → listen again.
 */
export function useVoiceSession(options: VoiceSessionOptions) {
  const stopListenRef = React.useRef<(() => void) | null>(null)
  const stopSpeakRef = React.useRef<(() => void) | null>(null)
  const [phase, setPhase] = React.useState<VoiceSessionPhase>('idle')
  const [liveTranscript, setLiveTranscript] = React.useState('')
  const sessionActiveRef = React.useRef(false)
  const phaseRef = React.useRef<VoiceSessionPhase>('idle')

  const setPhaseSafe = React.useCallback(
    (next: VoiceSessionPhase) => {
      phaseRef.current = next
      setPhase(next)
      options.onPhaseChange?.(next)
    },
    [options],
  )

  const stopListening = React.useCallback(() => {
    stopListenRef.current?.()
    stopListenRef.current = null
  }, [])

  const startListening = React.useCallback(() => {
    if (!options.enabled || !options.active || !speechSupported()) return
    if (options.busy || !options.greetingDone) return
    if (!sessionActiveRef.current) return

    stopListening()
    stopSpeaking()
    setLiveTranscript('')
    setPhaseSafe('listening')

    stopListenRef.current = listen({
      lang: options.language,
      continuous: true,
      onResult: ({ transcript, final }) => {
        if (final) {
          const trimmed = transcript.trim()
          setLiveTranscript('')
          stopListening()
          if (!trimmed) {
            window.setTimeout(() => startListeningRef.current(), 200)
            return
          }
          if (isStopPhrase(trimmed)) {
            sessionActiveRef.current = false
            setPhaseSafe('idle')
            options.onStopSession()
            speak('Alright. I am here whenever you need me.', { lang: options.language })
            return
          }
          setPhaseSafe('processing')
          options.onQuestion(trimmed)
        } else {
          setLiveTranscript(transcript)
          options.onTranscript(transcript)
        }
      },
      onError: (message) => {
        options.onError?.(message)
        setPhaseSafe('idle')
      },
      onEnd: () => {
        if (
          sessionActiveRef.current &&
          !options.busy &&
          options.greetingDone &&
          phaseRef.current === 'listening'
        ) {
          window.setTimeout(() => startListeningRef.current(), 300)
        }
      },
    })
  }, [options, setPhaseSafe, stopListening])

  const startListeningRef = React.useRef(startListening)
  startListeningRef.current = startListening

  const speakAnswer = React.useCallback(
    (text: string) => {
      if (!options.enabled || !text.trim()) {
        startListeningRef.current()
        return
      }
      stopListening()
      setPhaseSafe('speaking')
      stopSpeakRef.current = speak(text, {
        lang: options.language,
        onEnd: () => {
          if (sessionActiveRef.current && options.enabled) {
            setPhaseSafe('listening')
            startListeningRef.current()
          } else {
            setPhaseSafe('idle')
          }
        },
      })
    },
    [options.enabled, options.language, setPhaseSafe, stopListening],
  )

  const beginSession = React.useCallback(() => {
    if (!options.enabled || !speechSupported()) return
    sessionActiveRef.current = true
    preloadVoices()
    if (options.greetingDone && !options.busy) {
      startListeningRef.current()
    }
  }, [options.enabled, options.greetingDone, options.busy])

  const endSession = React.useCallback(() => {
    sessionActiveRef.current = false
    stopListening()
    stopSpeakRef.current?.()
    stopSpeaking()
    setLiveTranscript('')
    setPhaseSafe('idle')
  }, [setPhaseSafe, stopListening])

  const interrupt = React.useCallback(() => {
    stopSpeakRef.current?.()
    stopSpeaking()
    if (sessionActiveRef.current) {
      startListeningRef.current()
    }
  }, [])

  React.useEffect(() => {
    if (!options.active) {
      endSession()
      return
    }
    if (!options.enabled) {
      setPhaseSafe('idle')
      return
    }
    if (options.greetingDone && !options.busy && sessionActiveRef.current && phaseRef.current === 'idle') {
      startListeningRef.current()
    }
  }, [options.active, options.enabled, options.greetingDone, options.busy, endSession, setPhaseSafe])

  React.useEffect(() => () => endSession(), [endSession])

  return {
    phase,
    liveTranscript,
    beginSession,
    endSession,
    speakAnswer,
    interrupt,
    setProcessing: () => setPhaseSafe('processing'),
  }
}
