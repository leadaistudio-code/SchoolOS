'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'
import { ChevronLeft, ChevronRight, Expand, Grid2x2, Grid3x3, LayoutGrid, Loader2, RefreshCw, Square, VideoOff, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/states'
import { ZONE_LABEL } from '@/lib/cctv'
import { cn } from '@/lib/utils'
import type { ViewableCamera, ViewGrant } from '@/server/modules/cctv/service'
import { viewGrantAction } from './actions'

const LAYOUTS = [
  { size: 1, label: 'One camera', icon: Square, cols: 'grid-cols-1' },
  { size: 4, label: '2 × 2', icon: Grid2x2, cols: 'grid-cols-1 sm:grid-cols-2' },
  { size: 9, label: '3 × 3', icon: Grid3x3, cols: 'grid-cols-2 lg:grid-cols-3' },
  { size: 16, label: '4 × 4', icon: LayoutGrid, cols: 'grid-cols-2 lg:grid-cols-4' },
] as const

type TileStatus = 'connecting' | 'live' | 'retrying' | 'unsupported' | 'error'

function streamPath(cameraId: string, hd: boolean) {
  return `cam-${cameraId}${hd ? '-hd' : ''}`
}

function CameraTile({
  camera,
  baseUrl,
  tokenRef,
  hd,
  large,
  onOpen,
  onDenied,
}: {
  camera: ViewableCamera
  baseUrl: string
  tokenRef: React.RefObject<string>
  hd: boolean
  large?: boolean
  onOpen?: () => void
  /** Called when the relay turns the token away; resolves once a fresh one is in tokenRef. */
  onDenied?: () => Promise<unknown>
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<TileStatus>('connecting')
  const [run, setRun] = useState(0)
  const failures = useRef(0)

  function retryNow() {
    failures.current = 0
    setRun((r) => r + 1)
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: Hls | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    setStatus('connecting')

    import('hls.js').then(({ default: HlsCtor }) => {
      if (cancelled) return
      if (!HlsCtor.isSupported()) {
        setStatus('unsupported')
        return
      }
      hls = new HlsCtor({
        lowLatencyMode: true,
        liveSyncDurationCount: 2,
        manifestLoadingMaxRetry: 2,
        xhrSetup: (xhr) => xhr.setRequestHeader('Authorization', `Bearer ${tokenRef.current}`),
      })
      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => undefined)
      })
      hls.on(HlsCtor.Events.FRAG_BUFFERED, () => {
        failures.current = 0
        setStatus('live')
      })
      hls.on(HlsCtor.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError()
          return
        }
        hls?.destroy()
        hls = null
        failures.current += 1
        if (failures.current > 4) {
          setStatus('error')
          return
        }
        setStatus('retrying')
        // A camera added after the token was issued is not in it yet.
        const denied = data.response?.code === 401 || data.response?.code === 403
        if (denied && onDenied) {
          void onDenied().finally(() => {
            if (!cancelled) retryTimer = setTimeout(() => setRun((r) => r + 1), 1000)
          })
          return
        }
        retryTimer = setTimeout(() => setRun((r) => r + 1), 4000)
      })
      hls.loadSource(`${baseUrl}/${streamPath(camera.id, hd)}/index.m3u8`)
      hls.attachMedia(video)
    })

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      hls?.destroy()
    }
  }, [baseUrl, camera.id, hd, run, tokenRef, onDenied])

  function fullscreen() {
    wrapRef.current?.requestFullscreen?.().catch(() => undefined)
  }

  return (
    <div ref={wrapRef} className="group relative overflow-hidden rounded-[var(--radius)] bg-black shadow-sm">
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className={cn('block w-full bg-black object-contain', large ? 'aspect-video max-h-[75vh]' : 'aspect-video')}
        aria-label={`Live view: ${camera.name}`}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{camera.name}</p>
          <p className="truncate text-xs text-white/70">
            {camera.sectionLabel ?? ZONE_LABEL[camera.zone]}
            {hd ? ' · HD' : ''}
          </p>
        </div>
        {status === 'live' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden /> Live
          </span>
        ) : null}
      </div>

      {status !== 'live' ? (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-white/85">
          {status === 'connecting' || status === 'retrying' ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
            </span>
          ) : status === 'unsupported' ? (
            <span className="max-w-xs">This browser cannot play live CCTV. Use Chrome, Edge or the latest Safari.</span>
          ) : (
            <span className="flex flex-col items-center gap-2">
              <VideoOff className="size-6" aria-hidden />
              <span className="max-w-xs">Camera not reachable. The school PC or internet may be off.</span>
              <button
                type="button"
                onClick={retryNow}
                className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25"
              >
                <RefreshCw className="size-3.5" aria-hidden /> Try again
              </button>
            </span>
          )}
        </div>
      ) : null}

      <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white hover:bg-black/80"
          >
            Open
          </button>
        ) : null}
        <button
          type="button"
          onClick={fullscreen}
          aria-label="Full screen"
          className="grid size-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
        >
          <Expand className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}

export function LiveGrid({ cameras }: { cameras: ViewableCamera[] }) {
  const tokenRef = useRef('')
  const [grant, setGrant] = useState<ViewGrant | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [layout, setLayout] = useState<number>(cameras.length === 1 ? 1 : cameras.length <= 4 ? 4 : 9)
  const [page, setPage] = useState(0)
  const [focus, setFocus] = useState<ViewableCamera | null>(null)
  const [hd, setHd] = useState(false)

  const fetchGrant = useCallback(async (refresh: boolean) => {
    const r = await viewGrantAction(refresh)
    if (!r.ok) {
      setError(r.message)
      setGrant(null)
      return null
    }
    tokenRef.current = r.grant.token
    setError(null)
    setGrant((g) => (g && g.baseUrl === r.grant.baseUrl ? { ...g, expiresAt: r.grant.expiresAt } : r.grant))
    return r.grant
  }, [])

  useEffect(() => {
    void fetchGrant(false)
  }, [fetchGrant])

  // Shared by every tile, so a burst of refusals asks for one new token, at most every 10 seconds.
  const renewing = useRef<Promise<unknown> | null>(null)
  const lastRenew = useRef(0)
  const renewGrant = useCallback(() => {
    if (renewing.current) return renewing.current
    if (Date.now() - lastRenew.current < 10_000) return Promise.resolve()
    lastRenew.current = Date.now()
    renewing.current = fetchGrant(true).finally(() => {
      renewing.current = null
    })
    return renewing.current
  }, [fetchGrant])

  useEffect(() => {
    if (!grant) return
    const wait = Math.max(15_000, new Date(grant.expiresAt).getTime() - Date.now() - 60_000)
    const timer = setTimeout(() => void fetchGrant(true), wait)
    return () => clearTimeout(timer)
  }, [grant, fetchGrant])

  const pages = Math.max(1, Math.ceil(cameras.length / layout))
  const current = Math.min(page, pages - 1)
  const shown = cameras.slice(current * layout, current * layout + layout)
  const cols = LAYOUTS.find((l) => l.size === layout)?.cols ?? 'grid-cols-2'

  if (error) {
    return (
      <Notice tone="warning">
        {error}{' '}
        <button type="button" className="font-medium underline underline-offset-2" onClick={() => void fetchGrant(false)}>
          Try again
        </button>
      </Notice>
    )
  }

  if (!grant) {
    return (
      <div className="grid aspect-video place-items-center rounded-[var(--radius)] bg-black/90 text-sm text-white/80">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Starting live view…
        </span>
      </div>
    )
  }

  if (focus) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setFocus(null); setHd(false) }}>
            <X className="size-4" aria-hidden /> Back to all cameras
          </Button>
          {focus.hd ? (
            <Button variant={hd ? 'primary' : 'secondary'} size="sm" onClick={() => setHd((v) => !v)}>
              {hd ? 'HD on' : 'Switch to HD'}
            </Button>
          ) : null}
          {hd ? <span className="text-xs text-ink-subtle">HD uses more internet. If it stays black, the recorder may send HD in H.265, which browsers cannot play.</span> : null}
        </div>
        <CameraTile key={`${focus.id}-${hd}`} camera={focus} baseUrl={grant.baseUrl} tokenRef={tokenRef} hd={hd} large onDenied={renewGrant} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {cameras.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-[var(--radius-sm)] border border-line bg-surface p-0.5" role="group" aria-label="Grid size">
            {LAYOUTS.filter((l, i) => i <= 1 || LAYOUTS[i - 1]!.size < cameras.length).map((l) => (
              <button
                key={l.size}
                type="button"
                onClick={() => { setLayout(l.size); setPage(0) }}
                aria-pressed={layout === l.size}
                title={l.label}
                className={cn(
                  'grid size-8 place-items-center rounded-[calc(var(--radius-sm)-2px)] text-ink-muted hover:text-ink',
                  layout === l.size && 'bg-brand text-brand-contrast hover:text-brand-contrast',
                )}
              >
                <l.icon className="size-4" aria-hidden />
                <span className="sr-only">{l.label}</span>
              </button>
            ))}
          </div>
          {pages > 1 ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Button variant="secondary" size="sm" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Previous cameras">
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <span>
                {current + 1} / {pages}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Next cameras">
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          ) : (
            <Badge tone="neutral">
              {cameras.length} camera{cameras.length === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
      ) : null}
      <div className={cn('grid gap-3', cols)}>
        {shown.map((camera) => (
          <CameraTile
            key={camera.id}
            camera={camera}
            baseUrl={grant.baseUrl}
            tokenRef={tokenRef}
            hd={false}
            onOpen={cameras.length > 1 || camera.hd ? () => setFocus(camera) : undefined}
            onDenied={renewGrant}
          />
        ))}
      </div>
    </div>
  )
}
