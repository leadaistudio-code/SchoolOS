'use client'

import * as React from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * The MyCampusView brand mark.
 *
 * One component, three crops of one master asset. Every surface that shows the
 * product's own brand renders this rather than pasting an image tag, so a
 * future change to the lockup is a change to one file.
 *
 * Note what this is NOT for: the authenticated application is white-labelled
 * and shows each school's own logo (`school.logoUrl`). MyCampusView's mark
 * belongs on the marketing site and on the platform console — never in place
 * of a customer's identity.
 *
 * Sizing is driven by height, with width derived from the asset's real pixel
 * ratio, so the mark can never stretch and never shifts the layout while it
 * loads.
 */

/** The three crops of the approved master. Nothing else references these paths. */
const ASSET = {
  /** The complete lockup: symbol, wordmark, tagline, five pillars. */
  full: { src: '/brand/mycampusview-logo.png', w: 1285, h: 844 },
  /** Symbol and wordmark. For rows too short to render the tagline legibly. */
  compact: { src: '/brand/mycampusview-lockup.png', w: 1270, h: 700 },
  /** The symbol alone, square. Favicons, avatars, anything small. */
  mark: { src: '/brand/mycampusview-mark.png', w: 510, h: 510 },
} as const

export type LogoVariant = keyof typeof ASSET
export type LogoSize = 'sm' | 'md' | 'lg' | 'xl'

/**
 * Rendered height, in pixels, per variant.
 *
 * Held apart per variant because the crops are different shapes: 44px is a
 * generous header mark and an illegible full lockup.
 */
const HEIGHT: Record<LogoVariant, Record<LogoSize, number>> = {
  full: { sm: 76, md: 104, lg: 140, xl: 180 },
  compact: { sm: 38, md: 50, lg: 64, xl: 84 },
  mark: { sm: 24, md: 32, lg: 44, xl: 64 },
}

export function MyCampusViewLogo({
  variant = 'compact',
  size = 'md',
  animated = false,
  float = false,
  tilt = false,
  shimmer = false,
  onDark = false,
  priority = false,
  className,
}: {
  variant?: LogoVariant
  size?: LogoSize
  /** The perspective entrance. Once, on mount. */
  animated?: boolean
  /** Marketing only: a barely-there vertical drift. */
  float?: boolean
  /** Desktop marketing only: a small pointer-responsive tilt. */
  tilt?: boolean
  /** One slow highlight across the mark, shortly after it arrives. */
  shimmer?: boolean
  /**
   * The mark sits on a dark ground.
   *
   * The wordmark is navy and the master carries a soft light bloom, so on a
   * dark surface it needs a light one of its own. The logo itself is untouched;
   * what changes is what it is presented on.
   */
  onDark?: boolean
  priority?: boolean
  className?: string
}) {
  const asset = ASSET[variant]
  const height = HEIGHT[variant][size]
  const width = Math.round((asset.w / asset.h) * height)
  const [missing, setMissing] = React.useState(false)

  // If the asset ever fails to resolve, the drawn wordmark stands in rather
  // than leaving a broken image where the brand should be.
  if (missing) return <FallbackWordmark onDark={onDark} height={height} className={className} />

  return (
    <LogoFrame
      animated={animated}
      float={float}
      tilt={tilt}
      shimmer={shimmer}
      onDark={onDark}
      height={height}
      className={className}
    >
      <Image
        src={asset.src}
        alt="MyCampusView"
        width={width}
        height={height}
        priority={priority}
        onError={() => setMissing(true)}
        // Explicit both ways: the ratio is the asset's own, so the box is
        // correct before the bytes arrive and nothing reflows.
        style={{ height, width, objectFit: 'contain' }}
        className="block"
      />
    </LogoFrame>
  )
}

/**
 * The motion wrapper.
 *
 * Pure CSS transforms — the asset already carries its own 3D shading, and
 * introducing a renderer to move a flat image would be cost without benefit.
 * Perspective lives on the frame so the inner rotation reads as depth rather
 * than as skew.
 */
function LogoFrame({
  children,
  animated,
  float,
  tilt,
  shimmer,
  onDark,
  height,
  className,
}: {
  children: React.ReactNode
  animated?: boolean
  float?: boolean
  tilt?: boolean
  shimmer?: boolean
  onDark?: boolean
  height: number
  className?: string
}) {
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    const node = ref.current
    if (!node || !tilt) return

    // Touch devices have no hover state to return from, and a tilt that never
    // resets reads as a rendering fault.
    if (window.matchMedia('(pointer: coarse)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    let settled = true

    const onMove = (event: PointerEvent) => {
      const box = node.getBoundingClientRect()
      const dx = (event.clientX - (box.left + box.width / 2)) / (box.width || 1)
      const dy = (event.clientY - (box.top + box.height / 2)) / (box.height || 1)
      // Clamped hard: past a few degrees this stops reading as material and
      // starts reading as an interactive card.
      targetY = Math.max(-1, Math.min(1, dx)) * 4
      targetX = Math.max(-1, Math.min(1, -dy)) * 3
      if (settled) {
        settled = false
        frame = requestAnimationFrame(tick)
      }
    }

    const onLeave = () => {
      targetX = 0
      targetY = 0
    }

    const tick = () => {
      currentX += (targetX - currentX) * 0.08
      currentY += (targetY - currentY) * 0.08
      node.style.setProperty('--tilt-x', `${currentX.toFixed(3)}deg`)
      node.style.setProperty('--tilt-y', `${currentY.toFixed(3)}deg`)
      // Back at rest with nowhere to go: stop the loop rather than burn a
      // frame a second forever on a page nobody is pointing at.
      if (Math.abs(targetX - currentX) < 0.01 && Math.abs(targetY - currentY) < 0.01 && !targetX && !targetY) {
        settled = true
        return
      }
      frame = requestAnimationFrame(tick)
    }

    // Listeners on the mark itself, not on the window: ten logos on a page do
    // not mean ten global pointer handlers.
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(frame)
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    }
  }, [tilt])

  return (
    <span
      ref={ref}
      style={{ '--mcv-h': `${height}px` } as React.CSSProperties}
      className={cn(
        'mcv-logo inline-flex',
        animated && 'mcv-logo-enter',
        float && 'mcv-logo-float',
        tilt && 'mcv-logo-tilt',
        onDark && 'mcv-logo-plate',
        className,
      )}
    >
      <span className="mcv-logo-inner">
        {children}
        {shimmer ? <span className="mcv-logo-sheen" aria-hidden /> : null}
      </span>
    </span>
  )
}

/**
 * The drawn fallback.
 *
 * Only rendered if the asset itself fails to load; it cannot fail in turn.
 */
function FallbackWordmark({
  onDark,
  height,
  className,
}: {
  onDark: boolean
  height: number
  className?: string
}) {
  const glyph = Math.round(height * 0.9)
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" style={{ width: glyph, height: glyph }} className="shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill={onDark ? '#fff' : 'var(--ink, #0a1024)'} />
        <g stroke={onDark ? 'var(--ink, #0a1024)' : '#fff'} strokeWidth="2" strokeLinecap="round">
          <path d="M9 12h14M9 17h14M9 22h8" opacity="0.9" />
        </g>
        <circle cx="23.5" cy="22" r="2.5" fill={onDark ? 'var(--blue, #1d4ed8)' : '#7ea2f5'} />
      </svg>
      <span
        className={cn(
          'font-semibold tracking-[-0.02em]',
          onDark ? 'text-white' : 'text-[var(--ink,#0a1024)]',
        )}
        style={{ fontSize: Math.round(height * 0.58) }}
      >
        MyCampusView
      </span>
    </span>
  )
}
