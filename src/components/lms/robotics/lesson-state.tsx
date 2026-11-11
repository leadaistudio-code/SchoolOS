'use client'

import * as React from 'react'

/**
 * A learner's saved work for one lesson: activity results, checklist ticks,
 * notes, code answers, simulator achievements, checkpoint answers.
 *
 * Writes are batched and sent to the server; anything not yet saved is kept in
 * localStorage and retried, so a dropped connection loses nothing.
 */

export type SaveState = (input: { patch?: Record<string, unknown>; videoSeconds?: number | null }) => Promise<{ ok: boolean }>

type Ctx = {
  state: Record<string, unknown>
  get: <T>(key: string, fallback: T) => T
  set: (key: string, value: unknown) => void
  saveVideo: (seconds: number) => void
  status: 'idle' | 'saving' | 'saved' | 'offline'
  readOnly: boolean
}

const LessonStateContext = React.createContext<Ctx | null>(null)

export function useLessonState(): Ctx {
  const ctx = React.useContext(LessonStateContext)
  if (ctx) return ctx
  // Outside a lesson (e.g. a standalone demo): keep state in memory only.
  return FALLBACK
}

const FALLBACK: Ctx = {
  state: {},
  get: (_k, f) => f,
  set: () => undefined,
  saveVideo: () => undefined,
  status: 'idle',
  readOnly: true,
}

export function LessonStateProvider({
  lessonId,
  initial,
  save,
  children,
}: {
  lessonId: string
  initial: Record<string, unknown>
  /** Absent in staff preview: nothing is stored. */
  save?: SaveState
  children: React.ReactNode
}) {
  const storageKey = `r101:pending:${lessonId}`
  const [state, setState] = React.useState<Record<string, unknown>>(() => ({ ...initial }))
  const [status, setStatus] = React.useState<Ctx['status']>('idle')
  const pending = React.useRef<Record<string, unknown>>({})
  const pendingVideo = React.useRef<number | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushing = React.useRef(false)

  const flush = React.useCallback(async () => {
    if (!save || flushing.current) return
    const patch = pending.current
    const videoSeconds = pendingVideo.current
    if (!Object.keys(patch).length && videoSeconds === null) return
    flushing.current = true
    pending.current = {}
    pendingVideo.current = null
    setStatus('saving')
    try {
      const result = await save({ ...(Object.keys(patch).length ? { patch } : {}), ...(videoSeconds !== null ? { videoSeconds } : {}) })
      if (!result.ok) throw new Error('save failed')
      setStatus('saved')
      try {
        localStorage.removeItem(storageKey)
      } catch {}
    } catch {
      pending.current = { ...patch, ...pending.current }
      if (videoSeconds !== null && pendingVideo.current === null) pendingVideo.current = videoSeconds
      setStatus('offline')
      try {
        localStorage.setItem(storageKey, JSON.stringify(pending.current))
      } catch {}
      timer.current = setTimeout(() => void flush(), 8000)
    } finally {
      flushing.current = false
    }
  }, [save, storageKey])

  const schedule = React.useCallback(
    (delay = 900) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delay)
    },
    [flush],
  )

  // Restore anything that did not reach the server last time.
  React.useEffect(() => {
    if (!save) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const restored = JSON.parse(raw) as Record<string, unknown>
      pending.current = { ...restored, ...pending.current }
      setState((s) => ({ ...s, ...restored }))
      schedule(300)
    } catch {}
  }, [save, storageKey, schedule])

  React.useEffect(() => {
    const online = () => schedule(200)
    const hide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', hide)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [flush, schedule])

  const value = React.useMemo<Ctx>(
    () => ({
      state,
      get: <T,>(key: string, fallback: T) => (key in state ? (state[key] as T) : fallback),
      set: (key, v) => {
        setState((s) => ({ ...s, [key]: v }))
        if (!save) return
        pending.current[key] = v
        schedule()
      },
      saveVideo: (seconds) => {
        if (!save) return
        pendingVideo.current = Math.round(seconds)
        schedule(4000)
      },
      status,
      readOnly: !save,
    }),
    [state, save, schedule, status],
  )

  return <LessonStateContext.Provider value={value}>{children}</LessonStateContext.Provider>
}
