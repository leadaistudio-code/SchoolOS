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
const RESTART_DELAY_MS = 350

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
 * Mic stays open during TTS so the user can interrupt (barge-in).
 */
export function useVoiceSession(options: VoiceSessionOptions) {
  const stopListenRef = React.useRef<(() => void) | null>(null)
  const stopSpeakRef = React.useRef<(() => void) | null>(null)
  const speakGenerationRef = React.useRef(0)
  const restartTimerRef = React.useRef<number | null>(null)
  const utteranceBufferRef = React.useRef('')
  const bargeInModeRef = React.useRef(false)

  const [phase, setPhase] = React.useState<VoiceSessionPhase>('idle')
  const [liveTranscript, setLiveTranscript] = React.useState('')
  const sessionActiveRef = React.useRef(false)
  const phaseRef = React.useRef<VoiceSessionPhase>('idle')

  const optionsRef = React.useRef(options)
  optionsRef.current = options

  const clearRestartTimer = React.useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  const setPhaseSafe = React.useCallback((next: VoiceSessionPhase) => {
    phaseRef.current = next
    setPhase(next)
    optionsRef.current.onPhaseChange?.(next)
  }, [])

  const stopListening = React.useCallback(() => {
    stopListenRef.current?.()
    stopListenRef.current = null
    bargeInModeRef.current = false
    utteranceBufferRef.current = ''
  }, [])

  const startListeningRef = React.useRef<(mode?: 'normal' | 'barge-in') => void>(() => {})

  const handleFinalTranscript = React.useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      setLiveTranscript('')
      stopListening()

      if (!trimmed) {
        restartTimerRef.current = window.setTimeout(() => startListeningRef.current('normal'), 200)
        return
      }

      const current = optionsRef.current
      if (isStopPhrase(trimmed)) {
        sessionActiveRef.current = false
        setPhaseSafe('idle')
        current.onStopSession()
        speak('Alright. I am here whenever you need me.', { lang: current.language })
        return
      }

      // Barge-in while the assistant is speaking — cut TTS and take the new question.
      if (phaseRef.current === 'speaking') {
        speakGenerationRef.current += 1
        stopSpeakRef.current?.()
        stopSpeaking()
      }

      setPhaseSafe('processing')
      current.onQuestion(trimmed)
    },
    [setPhaseSafe, stopListening],
  )

  const attachMic = React.useCallback(
    (mode: 'normal' | 'barge-in') => {
      const opts = optionsRef.current
      if (!opts.enabled || !opts.active || !speechSupported()) return false
      if (mode === 'normal') {
        if (opts.busy || !opts.greetingDone) return false
        if (!sessionActiveRef.current) return false
      } else if (!sessionActiveRef.current) {
        return false
      }

      stopListening()
      bargeInModeRef.current = mode === 'barge-in'
      utteranceBufferRef.current = ''

      if (mode === 'normal') {
        stopSpeaking()
        setPhaseSafe('listening')
      }

      stopListenRef.current = listen({
        lang: opts.language,
        continuous: true,
        onResult: ({ transcript, final }) => {
          const current = optionsRef.current
          const preview = final
            ? [utteranceBufferRef.current, transcript].filter(Boolean).join(' ').trim()
            : [utteranceBufferRef.current, transcript].filter(Boolean).join(' ').trim()

          if (final) {
            utteranceBufferRef.current = preview
            handleFinalTranscript(preview)
            utteranceBufferRef.current = ''
            return
          }

          if (!preview) return

          // Barge-in: user started talking over the assistant.
          if (bargeInModeRef.current && phaseRef.current === 'speaking') {
            speakGenerationRef.current += 1
            stopSpeakRef.current?.()
            stopSpeaking()
            bargeInModeRef.current = false
            setPhaseSafe('listening')
          }

          setLiveTranscript(preview)
          current.onTranscript(preview)
        },
        onError: (message) => {
          if (!message) return
          optionsRef.current.onError?.(message)
          const current = optionsRef.current
          if (
            sessionActiveRef.current &&
            current.greetingDone &&
            !current.busy &&
            phaseRef.current !== 'processing'
          ) {
            restartTimerRef.current = window.setTimeout(
              () => startListeningRef.current(phaseRef.current === 'speaking' ? 'barge-in' : 'normal'),
              600,
            )
          } else if (phaseRef.current === 'listening') {
            setPhaseSafe('idle')
          }
        },
        onEnd: () => {
          const current = optionsRef.current
          if (!sessionActiveRef.current || current.busy) return
          if (!current.greetingDone) return

          if (phaseRef.current === 'listening') {
            restartTimerRef.current = window.setTimeout(() => startListeningRef.current('normal'), RESTART_DELAY_MS)
          } else if (phaseRef.current === 'speaking' && bargeInModeRef.current) {
            restartTimerRef.current = window.setTimeout(() => startListeningRef.current('barge-in'), RESTART_DELAY_MS)
          }
        },
      })

      return true
    },
    [handleFinalTranscript, setPhaseSafe, stopListening],
  )

  const startListening = React.useCallback(
    (mode: 'normal' | 'barge-in' = 'normal') => {
      clearRestartTimer()
      attachMic(mode)
    },
    [attachMic, clearRestartTimer],
  )

  startListeningRef.current = startListening

  const resumeListening = React.useCallback(() => {
    clearRestartTimer()
    if (!sessionActiveRef.current || !optionsRef.current.enabled) return
    if (!optionsRef.current.greetingDone || optionsRef.current.busy) return
    restartTimerRef.current = window.setTimeout(() => startListeningRef.current('normal'), RESTART_DELAY_MS)
  }, [clearRestartTimer])

  const speakAnswer = React.useCallback(
    (text: string) => {
      const opts = optionsRef.current
      clearRestartTimer()
      stopListening()

      if (!opts.enabled || !text.trim()) {
        resumeListening()
        return
      }

      const generation = ++speakGenerationRef.current
      setPhaseSafe('speaking')

      // Keep the mic open during TTS so the user can interrupt.
      attachMic('barge-in')

      stopSpeakRef.current = speak(text, {
        lang: opts.language,
        onEnd: () => {
          if (generation !== speakGenerationRef.current) return
          stopListening()
          setPhaseSafe('idle')
          resumeListening()
        },
      })
    },
    [attachMic, clearRestartTimer, resumeListening, setPhaseSafe, stopListening],
  )

  const beginSession = React.useCallback(() => {
    const opts = optionsRef.current
    if (!opts.enabled || !speechSupported()) return
    sessionActiveRef.current = true
    preloadVoices()
    if (opts.greetingDone && !opts.busy) {
      resumeListening()
    }
  }, [resumeListening])

  const endSession = React.useCallback(() => {
    sessionActiveRef.current = false
    clearRestartTimer()
    stopListening()
    stopSpeakRef.current?.()
    stopSpeaking()
    speakGenerationRef.current += 1
    setLiveTranscript('')
    setPhaseSafe('idle')
  }, [clearRestartTimer, setPhaseSafe, stopListening])

  const pauseForProcessing = React.useCallback(() => {
    clearRestartTimer()
    stopListening()
    speakGenerationRef.current += 1
    stopSpeakRef.current?.()
    stopSpeaking()
  }, [clearRestartTimer, stopListening])

  const interrupt = React.useCallback(() => {
    clearRestartTimer()
    speakGenerationRef.current += 1
    stopSpeakRef.current?.()
    stopSpeaking()
    stopListening()
    if (sessionActiveRef.current && !optionsRef.current.busy) {
      startListeningRef.current('normal')
    }
  }, [clearRestartTimer, stopListening])

  // When processing finishes, resumeListening is triggered by the caller (panel).
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
    if (opts.greetingDone && !opts.busy && sessionActiveRef.current && phaseRef.current === 'idle') {
      resumeListening()
    }
  }, [options.active, options.enabled, options.greetingDone, options.busy, endSession, resumeListening, setPhaseSafe])

  React.useEffect(() => () => endSession(), [endSession])

  return {
    phase,
    liveTranscript,
    beginSession,
    endSession,
    speakAnswer,
    interrupt,
    pauseForProcessing,
    resumeListening,
    setProcessing: () => setPhaseSafe('processing'),
  }
}
