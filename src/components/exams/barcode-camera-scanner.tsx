'use client'

import * as React from 'react'
import { Camera, SwitchCamera } from 'lucide-react'
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
}

type FacingMode = 'environment' | 'user'

function getNativeDetector(): BarcodeDetectorLike | null {
  if (typeof window === 'undefined') return null
  const Ctor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector
  if (!Ctor) return null
  try {
    return new Ctor({ formats: ['qr_code', 'code_128', 'code_39'] })
  } catch {
    return null
  }
}

function prefersRearCamera(): boolean {
  if (typeof window === 'undefined') return true
  // Phones/tablets: prefer the rear camera. Laptops usually only have a front
  // webcam, and forcing `environment` can fail or pick nothing useful.
  return window.matchMedia('(pointer: coarse)').matches
}

async function openCameraStream(facingMode: FacingMode): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Camera API is not available in this browser.', 'NotSupportedError')
  }

  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      audio: false,
      video: {
        facingMode,
      },
    },
    // Last resort: any camera. Desktop Chrome often needs this when facingMode
    // constraints are over-constrained for a single built-in webcam.
    { audio: false, video: true },
  ]

  let lastError: unknown
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      lastError = err
      const name = err instanceof DOMException ? err.name : ''
      // Permission and missing-device errors will not be fixed by a softer constraint.
      if (
        name === 'NotAllowedError' ||
        name === 'PermissionDeniedError' ||
        name === 'NotFoundError' ||
        name === 'DevicesNotFoundError' ||
        name === 'SecurityError'
      ) {
        throw err
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new DOMException('Could not start the camera.', 'NotReadableError')
}

/**
 * Camera barcode / QR scanner for admit-card check-in.
 * Prefer the native BarcodeDetector API when present; otherwise ZXing.
 * Works on phones (rear camera) and laptops/desktops with a webcam.
 */
export function BarcodeCameraScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean
  onClose: () => void
  onDetected: (value: string) => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const controlsRef = React.useRef<IScannerControls | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const rafRef = React.useRef<number>(0)
  const handledRef = React.useRef(false)
  const [error, setError] = React.useState<string | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [facingMode, setFacingMode] = React.useState<FacingMode>(() =>
    prefersRearCamera() ? 'environment' : 'user',
  )

  const stop = React.useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    controlsRef.current?.stop()
    controlsRef.current = null
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    const video = videoRef.current
    if (video) {
      video.srcObject = null
    }
  }, [])

  const handleValue = React.useCallback(
    (raw: string) => {
      const value = raw.trim()
      if (!value || handledRef.current) return
      handledRef.current = true
      stop()
      onDetected(value)
      onClose()
    },
    [onClose, onDetected, stop],
  )

  React.useEffect(() => {
    if (!open) {
      stop()
      return
    }

    handledRef.current = false
    setError(null)
    setStarting(true)

    let cancelled = false

    const start = async () => {
      const video = videoRef.current
      if (!video) return

      if (!window.isSecureContext) {
        setError('Camera scanning needs https:// (or localhost).')
        setStarting(false)
        return
      }

      try {
        const stream = await openCameraStream(facingMode)
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        video.srcObject = stream
        await video.play()

        const native = getNativeDetector()
        if (native) {
          setStarting(false)
          const tick = async () => {
            if (cancelled || handledRef.current || !videoRef.current) return
            try {
              if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                const codes = await native.detect(video)
                const value = codes[0]?.rawValue?.trim()
                if (value) {
                  handleValue(value)
                  return
                }
              }
            } catch {
              // Keep scanning; intermittent detect failures are normal.
            }
            rafRef.current = requestAnimationFrame(() => {
              void tick()
            })
          }
          rafRef.current = requestAnimationFrame(() => {
            void tick()
          })
          return
        }

        // ZXing path: reuse the stream already granted above so we do not ask
        // for camera permission a second time with different constraints.
        const reader = new BrowserMultiFormatReader()
        reader.possibleFormats = [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39]
        const controls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) handleValue(result.getText())
        })
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
        setStarting(false)
      } catch (err) {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
          setError(
            'Camera access was blocked. In the address bar, allow Camera for this site, then click Switch camera or open Scan again.',
          )
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('No camera was found on this device.')
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setError('The camera is already in use by another app. Close it and try again.')
        } else if (name === 'NotSupportedError') {
          setError('This browser cannot open the camera. Try Chrome or Edge on https://.')
        } else {
          setError(err instanceof Error ? err.message : 'Could not start the camera.')
        }
        setStarting(false)
      }
    }

    // Wait one frame so the dialog video element is mounted.
    const timer = window.setTimeout(() => {
      void start()
    }, 50)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      stop()
    }
  }, [open, facingMode, handleValue, stop])

  return (
    <Dialog
      open={open}
      onClose={() => {
        stop()
        onClose()
      }}
      title="Scan admit card"
      description="Point the camera at the QR code on the admit card."
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              stop()
              setFacingMode((current) => (current === 'environment' ? 'user' : 'environment'))
            }}
          >
            <SwitchCamera className="size-4" aria-hidden />
            Switch camera
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              stop()
              onClose()
            }}
          >
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-[var(--radius)] border border-line bg-black aspect-[4/3] sm:aspect-video">
          <video
            ref={videoRef}
            className="size-full object-cover"
            muted
            playsInline
            autoPlay
          />
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <div className="size-[min(70%,18rem)] rounded-[14px] border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          {starting && !error ? (
            <div className="absolute inset-0 grid place-items-center bg-black/50 text-sm text-white">
              Starting camera…
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="rounded-[var(--radius-sm)] border border-[var(--danger)]/30 bg-danger-bg px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <Camera className="size-3.5 shrink-0" aria-hidden />
            Hold steady until the code is recognised. USB barcode scanners can still use the text field.
          </p>
        )}
      </div>
    </Dialog>
  )
}
