'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/states'
import type { VoiceCaptureResult } from '@/server/modules/platform/growth/voice'

const MAX_SECONDS = 300

type Phase = 'idle' | 'recording' | 'understanding'

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * One tap to record a visit note in Hindi or English, one tap to stop. The
 * note is transcribed and understood on the server and handed back as a draft.
 */
export function VoiceRecorder({
  autoStart = false,
  onResult,
}: {
  autoStart?: boolean
  onResult: (result: VoiceCaptureResult) => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const cancelled = useRef(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const started = useRef(false)
  const meter = useRef<{ ctx: AudioContext; frame: number } | null>(null)
  const loudest = useRef(0)
  const [level, setLevel] = useState(0)

  function release() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    if (meter.current) {
      cancelAnimationFrame(meter.current.frame)
      void meter.current.ctx.close()
      meter.current = null
    }
    recorder.current?.stream.getTracks().forEach((t) => t.stop())
    recorder.current = null
  }

  /** Live loudness, so the rep sees the phone is hearing them, and silence is caught before upload. */
  function watchLevel(stream: MediaStream) {
    try {
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      const samples = new Float32Array(analyser.fftSize)
      const tick = () => {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const v of samples) sum += v * v
        const rms = Math.sqrt(sum / samples.length)
        loudest.current = Math.max(loudest.current, rms)
        setLevel(Math.min(1, rms * 8))
        if (meter.current) meter.current.frame = requestAnimationFrame(tick)
      }
      meter.current = { ctx, frame: requestAnimationFrame(tick) }
    } catch {
      loudest.current = 1
    }
  }

  useEffect(() => release, [])

  async function start() {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Please use Chrome on your phone.')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      setError('Microphone permission was blocked. Allow the microphone for this site and try again.')
      return
    }
    const mimeType = pickMimeType()
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined)
    chunks.current = []
    cancelled.current = false
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data)
    }
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || 'audio/webm'
      release()
      if (cancelled.current) {
        setPhase('idle')
        return
      }
      if (loudest.current < 0.01) {
        setPhase('idle')
        setError('We could not hear anything. Check the microphone is not blocked or muted, and speak close to the phone.')
        return
      }
      void upload(new Blob(chunks.current, { type }))
    }
    recorder.current = rec
    loudest.current = 0
    watchLevel(stream)
    rec.start(1000)
    setSeconds(0)
    setPhase('recording')
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) recorder.current?.stop()
        return s + 1
      })
    }, 1000)
  }

  function stop() {
    recorder.current?.stop()
  }

  function cancel() {
    cancelled.current = true
    recorder.current?.stop()
  }

  async function upload(blob: Blob) {
    setPhase('understanding')
    try {
      const form = new FormData()
      form.append('audio', blob, `visit.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`)
      const response = await fetch('/api/v1/platform/crm/voice-capture', { method: 'POST', body: form })
      const json = (await response.json().catch(() => null)) as
        | { data: VoiceCaptureResult | null; error: { message: string } | null }
        | null
      if (!response.ok || !json?.data) {
        throw new Error(json?.error?.message ?? 'Could not understand the recording. Please try again.')
      }
      onResult(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not understand the recording. Please try again.')
    } finally {
      setPhase('idle')
    }
  }

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true
      void start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--brand-200,var(--line))] bg-[var(--brand-50)] p-4 text-center">
      {phase === 'idle' ? (
        <>
          <button
            type="button"
            onClick={() => void start()}
            className="mx-auto flex size-20 items-center justify-center rounded-full bg-[var(--brand-500)] text-white shadow-lg transition hover:brightness-110 active:scale-95"
            aria-label="Record voice note"
          >
            <Mic className="size-9" />
          </button>
          <div>
            <p className="font-semibold text-ink">Tap and tell us about the visit</p>
            <p className="mt-1 text-sm text-ink-muted">
              Hindi or English. Say the school, area, who you met with their number, what was discussed and when to
              follow up.
            </p>
          </div>
        </>
      ) : null}

      {phase === 'recording' ? (
        <>
          <div className="relative mx-auto flex size-20 items-center justify-center rounded-full bg-[var(--danger)] text-white">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--danger)] opacity-30" aria-hidden />
            <Mic className="relative size-9" />
          </div>
          <p className="font-semibold text-ink" aria-live="polite">
            Listening… {clock(seconds)}
          </p>
          <div className="mx-auto h-1.5 w-40 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-[var(--success,#16a34a)] transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <p className="text-xs text-ink-subtle">Stops automatically at {clock(MAX_SECONDS)}.</p>
          <div className="flex justify-center gap-2">
            <Button type="button" size="lg" onClick={stop}>
              <Square /> Done
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={cancel}>
              <X /> Cancel
            </Button>
          </div>
        </>
      ) : null}

      {phase === 'understanding' ? (
        <div className="flex flex-col items-center gap-2 py-4" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-[var(--brand-500)]" />
          <p className="font-semibold text-ink">Understanding your note…</p>
          <p className="text-sm text-ink-muted">Filling the form for you to check.</p>
        </div>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  )
}
