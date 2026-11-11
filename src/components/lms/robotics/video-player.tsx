'use client'

import * as React from 'react'
import { Captions, CaptionsOff, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, ScrollText, Volume2, VolumeX } from 'lucide-react'
import type { RichVideo } from '@/lib/lms/rich'
import { cn } from '@/lib/utils'
import { Feedback, Pill } from './activity-kit'
import { useLessonState } from './lesson-state'

const SPEEDS = [0.75, 1, 1.25, 1.5]

function clock(s: number) {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

export function LessonVideo({ video, resumeAt = 0, draft }: { video: RichVideo; resumeAt?: number; draft?: boolean }) {
  const { get, set, saveVideo } = useLessonState()
  const ref = React.useRef<HTMLVideoElement>(null)
  const frame = React.useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = React.useState(false)
  const [time, setTime] = React.useState(0)
  const [duration, setDuration] = React.useState(video.durationSeconds ?? 0)
  const [speed, setSpeed] = React.useState(1)
  const [captions, setCaptions] = React.useState(true)
  const [muted, setMuted] = React.useState(false)
  const [full, setFull] = React.useState(false)
  const [transcript, setTranscript] = React.useState(false)
  const [error, setError] = React.useState(false)
  const answered = get<Record<string, string>>('checkpoints', {})
  const [checkpoint, setCheckpoint] = React.useState<RichVideo['checkpoints'][number] | null>(null)
  const [cpChoice, setCpChoice] = React.useState<string | null>(null)
  const lastSaved = React.useRef(0)
  const resumed = React.useRef(false)

  const v = () => ref.current

  React.useEffect(() => {
    const el = v()
    if (!el) return
    const track = el.textTracks[0]
    if (track) track.mode = captions ? 'showing' : 'hidden'
  }, [captions])

  React.useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  function toggle() {
    const el = v()
    if (!el || checkpoint) return
    if (el.paused) void el.play()
    else el.pause()
  }

  function seek(to: number) {
    const el = v()
    if (!el) return
    el.currentTime = Math.max(0, Math.min(duration || el.duration || 0, to))
    setTime(el.currentTime)
  }

  function onTime() {
    const el = v()
    if (!el) return
    setTime(el.currentTime)
    if (Math.abs(el.currentTime - lastSaved.current) >= 10) {
      lastSaved.current = el.currentTime
      saveVideo(el.currentTime)
    }
    const due = video.checkpoints.find((c) => !answered[c.id] && el.currentTime >= c.at && el.currentTime < c.at + 1.5)
    if (due && !checkpoint) {
      el.pause()
      setCheckpoint(due)
      setCpChoice(null)
    }
  }

  function onKey(e: React.KeyboardEvent) {
    const el = v()
    if (!el || (e.target as HTMLElement).closest('input,select,button:not([data-video-surface])')) return
    const k = e.key.toLowerCase()
    if (k === ' ' || k === 'k') {
      e.preventDefault()
      toggle()
    } else if (k === 'arrowleft' || k === 'j') {
      e.preventDefault()
      seek(el.currentTime - (k === 'j' ? 10 : 5))
    } else if (k === 'arrowright' || k === 'l') {
      e.preventDefault()
      seek(el.currentTime + (k === 'l' ? 10 : 5))
    } else if (k === 'f') {
      void fullscreen()
    } else if (k === 'c') {
      setCaptions((c) => !c)
    } else if (k === 'm') {
      el.muted = !el.muted
      setMuted(el.muted)
    }
  }

  async function fullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await frame.current?.requestFullscreen?.()
  }

  async function pip() {
    const el = v()
    if (!el) return
    if (document.pictureInPictureElement) await document.exitPictureInPicture()
    else await el.requestPictureInPicture?.()
  }

  const chapterNow = [...video.chapters].reverse().find((c) => time >= c.at)
  const [pipSupported, setPipSupported] = React.useState(false)
  React.useEffect(() => setPipSupported('pictureInPictureEnabled' in document), [])

  if (!video.src) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-line p-4 text-sm text-ink-muted">
        <p className="font-medium text-ink">Video not rendered yet{draft ? ' (staff preview)' : ''}</p>
        <p className="mt-1">The script and captions exist; the MP4 has not been produced. Learners do not see this box.</p>
      </div>
    )
  }

  return (
    <figure className="space-y-2">
      <div
        ref={frame}
        className={cn('group relative overflow-hidden rounded-[var(--radius-lg)] border border-line bg-black', full && 'flex items-center rounded-none border-0')}
        onKeyDown={onKey}
        tabIndex={0}
        role="region"
        aria-label={`Video player: ${video.title}. Space to play or pause, arrows to skip, F for full screen, C for captions.`}
      >
        {draft ? <span className="absolute left-3 top-3 z-10 rounded-full bg-[var(--warning)] px-2 py-0.5 text-xs font-semibold text-black">Draft: staff only</span> : null}
        <video
          ref={ref}
          src={video.src}
          poster={video.poster}
          preload="metadata"
          playsInline
          crossOrigin="anonymous"
          className="aspect-video w-full"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false)
            const el = v()
            if (el) saveVideo(el.currentTime)
          }}
          onEnded={() => {
            setPlaying(false)
            saveVideo(0)
            set('videoWatched', true)
          }}
          onTimeUpdate={onTime}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget
            setDuration(el.duration)
            if (!resumed.current && resumeAt > 3 && resumeAt < el.duration - 5) {
              el.currentTime = resumeAt
              setTime(resumeAt)
            }
            resumed.current = true
            const track = el.textTracks[0]
            if (track) track.mode = captions ? 'showing' : 'hidden'
          }}
          onError={() => setError(true)}
        >
          {video.captions ? <track kind="captions" src={video.captions} srcLang="en-IN" label="English" default /> : null}
        </video>

        {checkpoint ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Checkpoint question">
            <div className="w-full max-w-lg rounded-[var(--radius-lg)] bg-surface p-4 shadow-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">Pause and think</p>
              <p className="mt-1 text-base font-semibold text-ink">{checkpoint.prompt}</p>
              <div className="mt-3 grid gap-1.5">
                {checkpoint.options.map((o) => (
                  <Pill
                    key={o.id}
                    autoFocus={o === checkpoint.options[0]}
                    className="justify-start rounded-[var(--radius)] px-3 py-2 text-left"
                    tone={cpChoice === o.id ? (o.correct ? 'right' : 'wrong') : undefined}
                    onClick={() => {
                      setCpChoice(o.id)
                      if (o.correct) set('checkpoints', { ...answered, [checkpoint.id]: o.id })
                    }}
                  >
                    {o.text}
                  </Pill>
                ))}
              </div>
              {cpChoice ? (
                (() => {
                  const o = checkpoint.options.find((x) => x.id === cpChoice)!
                  return (
                    <Feedback tone={o.correct ? 'right' : 'wrong'}>
                      {o.feedback ?? (o.correct ? 'Correct!' : 'Not quite. Try again.')}
                      {o.correct ? <p className="mt-1 text-ink-muted">{checkpoint.explanation}</p> : null}
                    </Feedback>
                  )
                })()
              ) : null}
              <div className="mt-3 flex justify-end gap-2">
                {cpChoice && checkpoint.options.find((x) => x.id === cpChoice)?.correct ? (
                  <button
                    type="button"
                    className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white"
                    onClick={() => {
                      setCheckpoint(null)
                      void v()?.play()
                    }}
                  >
                    Continue the video
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-sm text-ink-muted underline-offset-4 hover:underline"
                    onClick={() => {
                      set('checkpoints', { ...answered, [checkpoint.id]: 'skipped' })
                      setCheckpoint(null)
                      void v()?.play()
                    }}
                  >
                    Skip for now
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {!playing && !checkpoint ? (
          <button type="button" data-video-surface onClick={toggle} className="absolute inset-0 m-auto grid size-16 place-items-center rounded-full bg-white/90 text-ink shadow-lg" aria-label={time > 1 ? 'Resume video' : 'Play video'}>
            <Play className="ml-1 size-7" aria-hidden />
          </button>
        ) : null}

        <div className={cn('absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-white transition-opacity', playing ? 'opacity-0 focus-within:opacity-100 group-hover:opacity-100' : 'opacity-100')}>
          <div className="relative">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Seek"
              aria-valuetext={`${clock(time)} of ${clock(duration)}`}
              className="h-1.5 w-full cursor-pointer accent-[var(--ed-amber,#f0a63c)]"
            />
            {duration
              ? video.chapters.map((c) => (
                  <span key={c.at} className="pointer-events-none absolute top-0 h-1.5 w-0.5 bg-white/80" style={{ left: `${(c.at / duration) * 100}%` }} aria-hidden />
                ))
              : null}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs">
            <IconButton label={playing ? 'Pause' : 'Play'} onClick={toggle}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </IconButton>
            <IconButton label="Back 10 seconds" onClick={() => seek(time - 10)}>
              <RotateCcw className="size-4" />
            </IconButton>
            <IconButton
              label={muted ? 'Unmute' : 'Mute'}
              onClick={() => {
                const el = v()
                if (!el) return
                el.muted = !el.muted
                setMuted(el.muted)
              }}
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </IconButton>
            <span className="ml-1 tabular-nums">
              {clock(time)} / {clock(duration)}
            </span>
            {chapterNow ? <span className="ml-2 hidden truncate text-white/80 sm:inline">· {chapterNow.label}</span> : null}
            <span className="ml-auto flex items-center gap-1">
              <label className="sr-only" htmlFor={`${video.id}-speed`}>
                Playback speed
              </label>
              <select
                id={`${video.id}-speed`}
                value={speed}
                onChange={(e) => {
                  const s = Number(e.target.value)
                  setSpeed(s)
                  if (ref.current) ref.current.playbackRate = s
                }}
                className="h-7 rounded bg-white/15 px-1 text-xs text-white"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s} className="text-black">
                    {s}×
                  </option>
                ))}
              </select>
              {video.captions ? (
                <IconButton label={captions ? 'Hide captions' : 'Show captions'} onClick={() => setCaptions((c) => !c)} pressed={captions}>
                  {captions ? <Captions className="size-4" /> : <CaptionsOff className="size-4" />}
                </IconButton>
              ) : null}
              {pipSupported ? (
                <IconButton label="Picture in picture" onClick={() => void pip()}>
                  <PictureInPicture2 className="size-4" />
                </IconButton>
              ) : null}
              <IconButton label={full ? 'Exit full screen' : 'Full screen'} onClick={() => void fullscreen()}>
                {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
              </IconButton>
            </span>
          </div>
        </div>
      </div>
      {error ? <Feedback tone="wrong">The video could not load. Check your connection and refresh the page. Your place is saved.</Feedback> : null}
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {video.chapters.length ? (
          <nav aria-label="Chapters" className="flex flex-wrap gap-1.5">
            {video.chapters.map((c) => (
              <button
                key={c.at}
                type="button"
                onClick={() => {
                  seek(c.at)
                  void v()?.play()
                }}
                className={cn('rounded-full border px-2.5 py-1 text-xs', chapterNow?.at === c.at ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-surface-2')}
              >
                <span className="tabular-nums">{clock(c.at)}</span> {c.label}
              </button>
            ))}
          </nav>
        ) : null}
        {video.transcript ? (
          <button type="button" onClick={() => setTranscript((t) => !t)} className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink" aria-expanded={transcript}>
            <ScrollText className="size-3.5" aria-hidden /> {transcript ? 'Hide transcript' : 'Read the transcript'}
          </button>
        ) : null}
      </figcaption>
      {transcript && video.transcript ? (
        <div className="max-h-72 overflow-y-auto rounded-[var(--radius)] bg-surface-2 p-3 text-sm leading-relaxed text-ink whitespace-pre-line">{video.transcript}</div>
      ) : null}
    </figure>
  )
}

function IconButton({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={pressed} title={label} className="grid size-8 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">
      {children}
    </button>
  )
}
