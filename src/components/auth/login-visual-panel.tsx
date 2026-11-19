'use client'

import * as React from 'react'
import { HeroObjects } from '@/components/site/motion/hero-objects'
import { useReducedMotion } from '@/components/site/motion/provider'

const TOPICS = [
  { label: 'Robotics', x: '12%', y: '18%', delay: '0s' },
  { label: 'AI', x: '68%', y: '22%', delay: '0.4s' },
  { label: 'Coding', x: '22%', y: '48%', delay: '0.8s' },
  { label: 'Live classes', x: '58%', y: '52%', delay: '1.2s' },
] as const

/**
 * Desktop right column on Academy sign-in: glass robot parts (three.js), a
 * pointer spotlight, and soft topic chips. Schools that set a login banner
 * still get the photo path from the page; this is only the brand fallback.
 */
export function LoginVisualPanel({
  title,
  tagline,
  productName,
}: {
  title: string
  tagline: string
  productName: string
}) {
  const reduced = useReducedMotion()
  const panel = React.useRef<HTMLDivElement>(null)
  const [entered, setEntered] = React.useState(false)
  const [spot, setSpot] = React.useState({ x: 62, y: 38 })

  React.useEffect(() => {
    if (reduced) {
      setEntered(true)
      return
    }
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduced) return
    const node = panel.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    setSpot({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    })
  }

  const fade = (delay: number, lift = 14): React.CSSProperties => ({
    opacity: entered ? 1 : 0,
    transform: entered ? 'translateY(0)' : `translateY(${lift}px)`,
    transition: reduced
      ? 'none'
      : `opacity 700ms ease ${delay}ms, transform 700ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
  })

  return (
    <div
      ref={panel}
      className="login-visual relative hidden min-h-[320px] overflow-hidden lg:flex lg:flex-col lg:justify-end"
      onPointerMove={onPointerMove}
      style={{
        background:
          'radial-gradient(120% 90% at 70% 10%, color-mix(in srgb, var(--brand-500) 55%, #1a0505) 0%, transparent 55%), linear-gradient(160deg, var(--brand-700) 0%, color-mix(in srgb, var(--brand-700) 70%, #0a0404) 48%, #120808 100%)',
      }}
    >
      {/* Pointer spotlight — depth without competing with the form. */}
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-300 ease-out"
        style={{
          background: `radial-gradient(42% 36% at ${spot.x}% ${spot.y}%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 28%, transparent 62%)`,
          opacity: reduced ? 0.35 : 1,
        }}
        aria-hidden
      />

      {/* Soft mesh so the red field is never a flat slab. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 80%, rgba(255,200,160,0.18), transparent 40%), radial-gradient(circle at 90% 30%, rgba(255,255,255,0.12), transparent 35%)',
        }}
        aria-hidden
      />

      <HeroObjects
        arrangement="login"
        className="pointer-events-none absolute inset-0 z-[1]"
      />

      {!reduced
        ? TOPICS.map((topic) => (
            <span
              key={topic.label}
              className="login-visual-chip pointer-events-none absolute z-[2] rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] font-medium tracking-wide text-white/90 backdrop-blur-[2px]"
              style={{
                left: topic.x,
                top: topic.y,
                animationDelay: topic.delay,
                opacity: entered ? undefined : 0,
              }}
            >
              {topic.label}
            </span>
          ))
        : null}

      <div className="relative z-[3] max-w-md p-12 text-white">
        <p className="text-xl leading-snug text-balance" style={fade(120)}>
          {tagline}
        </p>
        <p className="mt-3 text-base text-white/70" style={fade(280, 8)}>
          {title} runs on {productName}
        </p>
      </div>
    </div>
  )
}
