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

  // Keep latest callbacks without re-creating listeners every parent render.
  const optionsRef = React.useRef(options)
  optionsRef.current = options

  const setPhaseSafe = React.useCallback((next: VoiceSessionPhase) => {
    phaseRef.current = next
    setPhase(next)
    optionsRef.current.onPhaseChange?.(next)
  }, [])

  const stopListening = React.useCallback(() => {
    stopListenRef.current?.()
    stopListenRef.current = null
  }, [])

  const startListeningRef = React.useRef<() => void>(() => {})

  const startListening = React.useCallback(() => {
    const opts = optionsRef.current
    if (!opts.enabled || !opts.active || !speechSupported()) return
    if (opts.busy || !opts.greetingDone) return
    if (!sessionActiveRef.current) return

    stopListening()
    stopSpeaking()
    setLiveTranscript('')
    setPhaseSafe('listening')

    stopListenRef.current = listen({
      lang: opts.language,
      continuous: true,
      onResult: ({ transcript, final }) => {
        const current = optionsRef.current
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
            current.onStopSession()
            speak('Alright. I am here whenever you need me.', { lang: current.language })
            return
          }
          setPhaseSafe('processing')
          current.onQuestion(trimmed)
        } else {
          setLiveTranscript(transcript)
          current.onTranscript(transcript)
        }
      },
      onError: (message) => {
        optionsRef.current.onError?.(message)
        // Chrome often blocks mic without a fresh user gesture — retry once after a beat.
        if (sessionActiveRef.current && optionsRef.current.greetingDone && !optionsRef.current.busy) {
          window.setTimeout(() => startListeningRef.current(), 600)
        } else {
          setPhaseSafe('idle')
        }
      },
      onEnd: () => {
        const current = optionsRef.current
        if (
          sessionActiveRef.current &&
          !current.busy &&
          current.greetingDone &&
          phaseRef.current === 'listening'
        ) {
          window.setTimeout(() => startListeningRef.current(), 300)
        }
      },
    })
  }, [setPhaseSafe, stopListening])

  startListeningRef.current = startListening

  const speakAnswer = React.useCallback(
    (text: string) => {
      const opts = optionsRef.current
      if (!opts.enabled || !text.trim()) {
        startListeningRef.current()
        return
      }
      stopListening()
      setPhaseSafe('speaking')
      stopSpeakRef.current = speak(text, {
        lang: opts.language,
        onEnd: () => {
          if (sessionActiveRef.current && optionsRef.current.enabled) {
            setPhaseSafe('listening')
            startListeningRef.current()
          } else {
            setPhaseSafe('idle')
          }
        },
      })
    },
    [setPhaseSafe, stopListening],
  )

  const beginSession = React.useCallback(() => {
    const opts = optionsRef.current
    if (!opts.enabled || !speechSupported()) return
    sessionActiveRef.current = true
    preloadVoices()
    if (opts.greetingDone && !opts.busy) {
      startListeningRef.current()
    }
  }, [])

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

  // Start listening when greeting finishes or panel becomes ready.
  React.useEffect(() => {
    const opts = optionsRef.current
    if (!opts.active) {
      endSession()
      return
    }
    if (!opts.enabled) {
      setPhaseSafe('idle')
      return
    }
    if (opts.greetingDone && !opts.busy && sessionActiveRef.current) {
      if (phaseRef.current === 'idle' || phaseRef.current === 'speaking') {
        startListeningRef.current()
      }
    }
  }, [options.active, options.enabled, options.greetingDone, options.busy, endSession, setPhaseSafe])

  // Tear down only on unmount — not when callback identities change.
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
