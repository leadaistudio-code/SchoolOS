'use client'

import * as React from 'react'
import Image from 'next/image'
import { gsap } from 'gsap'
import { useGsapReady, useReducedMotion } from '@/components/site/motion/provider'
import type { SiteImage } from '@/components/site/page-parts'

export type TrackStep = { title: string; body: string; image: SiteImage }

/**
 * How a course runs, as stops along a line-follower's track.
 *
 * The track is the one piece of scroll-linked motion on the page: it fills as
 * the reader moves down, and a small robot rides its leading edge. The stops
 * light up as the robot reaches them. Under reduced motion the track is drawn
 * in full and nothing moves.
 */
export function TrackSteps({ steps }: { steps: TrackStep[] }) {
  const root = React.useRef<HTMLOListElement>(null)
  const ready = useGsapReady()
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const node = root.current
    if (!ready || !node) return
    const fill = node.querySelector<HTMLElement>('[data-track-fill]')
    const rider = node.querySelector<HTMLElement>('[data-track-rider]')
    const stops = Array.from(node.querySelectorAll<HTMLElement>('[data-track-stop]'))
    if (!fill || !rider) return

    if (reduced) {
      gsap.set(fill, { scaleY: 1 })
      gsap.set(rider, { opacity: 0 })
      stops.forEach((s) => s.setAttribute('data-reached', 'true'))
      return
    }

    const context = gsap.context(() => {
      gsap.set(fill, { scaleY: 0, transformOrigin: 'top center' })
      gsap.to(fill, {
        scaleY: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: node,
          start: 'top 60%',
          end: 'bottom 60%',
          scrub: 0.6,
          onUpdate: (self) => {
            // All reads before any write, so this costs one layout per frame.
            const height = node.offsetHeight
            const reach = node.getBoundingClientRect().top + self.progress * height
            const reached = stops.map((stop) => {
              const dot = stop.querySelector('[data-track-dot]') ?? stop
              return dot.getBoundingClientRect().top <= reach + 4
            })
            rider.style.transform = `translate(-50%, ${self.progress * height}px)`
            stops.forEach((stop, i) => stop.setAttribute('data-reached', String(reached[i])))
          },
        },
      })
    }, node)

    return () => context.revert()
  }, [ready, reduced])

  return (
    <ol ref={root} className="relative">
      {/* The track. Sits under the stop markers in the left margin. */}
      <span aria-hidden className="absolute bottom-0 left-[11px] top-0 w-[2px] bg-[var(--rule)] sm:left-[15px]" />
      <span
        aria-hidden
        data-track-fill
        className="absolute bottom-0 left-[11px] top-0 w-[2px] bg-[var(--ed-ink)] sm:left-[15px]"
      />
      <span
        aria-hidden
        data-track-rider
        className="absolute left-[12px] top-0 z-10 grid size-7 place-items-center rounded-[7px] bg-[var(--ed-amber)] shadow-[0_0_0_4px_#fff] sm:left-[16px]"
        style={{ transform: 'translate(-50%, 0)' }}
      >
        <RobotGlyph />
      </span>

      {steps.map((step, i) => (
        <li
          key={step.title}
          data-track-stop
          data-reached="false"
          className="group/stop relative grid gap-8 pb-20 pl-12 last:pb-0 sm:pl-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-14"
        >
          <span
            aria-hidden
            data-track-dot
            className="absolute left-[4px] top-1 size-4 md:top-1/2 md:-translate-y-1/2 rounded-full border-2 border-[var(--rule-strong)] bg-white transition-colors duration-500 group-data-[reached=true]/stop:border-[var(--ed-ink)] group-data-[reached=true]/stop:bg-[var(--ed-ink)] sm:left-[8px]"
          />
          <div className={i % 2 ? 'md:order-2' : undefined}>
            <p className="text-[13.5px] font-medium tabular-nums text-[var(--text-subtle)]">
              {String(i + 1).padStart(2, '0')}
            </p>
            <h3 className="ed-display mt-3 text-[clamp(1.75rem,3vw,2.5rem)] !leading-[1.04]">{step.title}</h3>
            <p className="mt-5 max-w-[46ch] text-[16.5px] leading-[1.65] text-[var(--text-muted)]">{step.body}</p>
          </div>
          <Image
            src={step.image.src}
            alt={step.image.alt}
            width={1024}
            height={768}
            sizes="(min-width: 768px) 40vw, 100vw"
            className="aspect-[4/3] w-full max-w-[30rem] rounded-xl border border-[var(--rule)] bg-white object-cover md:justify-self-center"
          />
        </li>
      ))}
    </ol>
  )
}

function RobotGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 text-[var(--ed-ink)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="12" height="9" rx="2.5" />
      <path d="M10 6V3.5" />
      <circle cx="10" cy="3" r="0.6" fill="currentColor" />
      <circle cx="7.6" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.4" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <path d="M2.5 9v3M17.5 9v3" />
    </svg>
  )
}
