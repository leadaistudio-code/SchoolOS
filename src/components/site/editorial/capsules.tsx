'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EditorialHeading } from '../motion/editorial-heading'
import { Doodle } from '../motion/doodle'
import { useGsapReady, useReducedMotion } from '../motion/provider'
import { ALL_MODULES, MODULE_COUNTS } from '@/content/site/modules'
import { cn } from '@/lib/utils'

/**
 * What is actually built, as a field of capsules.
 *
 * The reference drops these in from above and lets them settle into a loose
 * pile. The physical part matters: they arrive on different trajectories, at
 * different speeds, and come to rest at angles, which is what separates a
 * composed field from a tag cloud.
 *
 * The names are the real module catalogue and only the modules that work
 * today — a capsule for something unbuilt would be the one dishonest element
 * on the page.
 */

const AVAILABLE = ALL_MODULES.filter((module) => module.status === 'available')

/**
 * Colour is assigned by position, not at random, so the field keeps the
 * reference's balance: mostly bone, punctuated.
 */
const TONES = [
  'bg-[#f2f1ec] text-[#0b0b0d]',
  'bg-[#2fb573] text-white',
  'bg-[#f2f1ec] text-[#0b0b0d]',
  'bg-[#e850a4] text-white',
  'bg-[#f2f1ec] text-[#0b0b0d]',
  'bg-[#f0b429] text-[#0b0b0d]',
  'bg-[#f2f1ec] text-[#0b0b0d]',
  'bg-[#4ea3f5] text-white',
  'bg-[#f2f1ec] text-[#0b0b0d]',
  'bg-[#b57ff0] text-white',
]

/** Authored scatter: seeded per index so the layout is identical every load. */
function place(index: number) {
  const wobble = Math.sin(index * 12.9898) * 43758.5453
  const fract = wobble - Math.floor(wobble)
  const second = Math.sin(index * 78.233) * 12345.6789
  const fract2 = second - Math.floor(second)

  return {
    rotate: (fract - 0.5) * 34,
    fromX: (fract2 - 0.5) * 420,
    fromY: -260 - fract * 340,
    delay: fract2 * 0.28,
  }
}

export function EditorialCapsules() {
  const root = React.useRef<HTMLDivElement>(null)
  const ready = useGsapReady()
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const node = root.current
    if (!ready || !node) return

    const chips = node.querySelectorAll<HTMLElement>('[data-capsule]')
    if (!chips.length) return

    if (reduced) {
      gsap.set(chips, { x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 })
      return
    }

    const context = gsap.context(() => {
      chips.forEach((chip, index) => {
        const spec = place(index)
        gsap.fromTo(
          chip,
          { x: spec.fromX, y: spec.fromY, rotate: spec.rotate * 2.4, opacity: 0, scale: 0.86 },
          {
            x: 0,
            y: 0,
            rotate: spec.rotate,
            opacity: 1,
            scale: 1,
            // Back.out gives the settle a little weight at the end, which is
            // what makes them read as objects rather than as fading labels.
            ease: 'back.out(1.15)',
            duration: 1.15,
            delay: spec.delay,
            scrollTrigger: { trigger: node, start: 'top 62%', once: true },
          },
        )
      })
    }, node)

    return () => context.revert()
  }, [ready, reduced])

  return (
    <div id="modules" ref={root} className="on-ed-black relative overflow-hidden px-[var(--gutter)] py-24 sm:py-32">
      <div className="mx-auto max-w-[70rem]">
        <div className="relative mx-auto max-w-[24ch] text-center">
          <EditorialHeading
            align="center"
            size="md"
            className="text-[var(--ed-on-black)]"
            lines={[
              { text: 'Everything', soft: 'that is' },
              { text: 'built', soft: 'today.', softFirst: false },
            ]}
          />
          {/* The reference marks the heading twice, in two hands. */}
          <Doodle
            name="underline"
            color="var(--ed-rose)"
            className="absolute -bottom-3 left-[6%] h-5 w-[42%] sm:-bottom-4 sm:h-7"
            delay={520}
          />
        </div>

        <p className="mx-auto mt-9 max-w-[46ch] text-center text-[15.5px] leading-[1.6] text-[var(--ed-on-black-soft)]">
          {MODULE_COUNTS.available} modules are available now, {MODULE_COUNTS.inBuild} are in build
          and {MODULE_COUNTS.planned} are planned. Only what works today is named here.
        </p>

        <div className="mt-16 flex flex-wrap items-center justify-center gap-x-3 gap-y-4 sm:mt-20">
          {AVAILABLE.map((module, index) => (
            <span
              key={module.name}
              data-capsule
              className={cn(
                'inline-flex items-center whitespace-nowrap rounded-full px-4 py-2.5 text-[14px] font-medium sm:px-5 sm:py-3 sm:text-[15px]',
                'will-change-transform',
                TONES[index % TONES.length],
              )}
            >
              {module.name}
            </span>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link href="/modules" className="ed-link text-[16px] text-white">
            The full catalogue, with what is not built yet
            <ArrowUpRight className="size-[1.05em]" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  )
}
