'use client'

import * as React from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import { useGsapReady, useReducedMotion } from '@/components/site/motion/provider'
import { cn } from '@/lib/utils'

export type Subject = { value: string; label: string; count: number }

/** Same palette and order of punctuation as the marketing site's module field. */
const TONES = [
  'bg-[#f0b429] text-[#0b0b0d]',
  'bg-[#f2f1ec] text-[#0b0b0d]',
  'bg-[#4ea3f5] text-white',
  'bg-[#f2f1ec] text-[#0b0b0d]',
  'bg-[#e850a4] text-white',
  'bg-[#2fb573] text-white',
  'bg-[#b57ff0] text-white',
]

/** Authored scatter, seeded per index so it lands the same way every visit. */
function place(index: number) {
  const a = Math.sin((index + 3) * 12.9898) * 43758.5453
  const b = Math.sin((index + 3) * 78.233) * 12345.6789
  const fa = a - Math.floor(a)
  const fb = b - Math.floor(b)
  return { rotate: (fa - 0.5) * 22, fromX: (fb - 0.5) * 360, fromY: -240 - fa * 300, delay: fb * 0.8 }
}

/**
 * The subjects, dropped onto the black ground. A subject with courses is a
 * link into the filtered catalogue; one without is shown but goes nowhere,
 * rather than leading to an empty list.
 */
export function SubjectField({ subjects }: { subjects: Subject[] }) {
  const root = React.useRef<HTMLDivElement>(null)
  const ready = useGsapReady()
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const node = root.current
    if (!ready || !node) return
    const chips = node.querySelectorAll<HTMLElement>('[data-capsule]')
    if (!chips.length) return
    if (reduced) {
      chips.forEach((chip, i) => gsap.set(chip, { x: 0, y: 0, rotate: place(i).rotate, opacity: 1 }))
      return
    }
    const context = gsap.context(() => {
      chips.forEach((chip, i) => {
        const spec = place(i)
        gsap.fromTo(
          chip,
          { x: spec.fromX, y: spec.fromY, rotate: spec.rotate * 2.6, opacity: 0 },
          {
            x: 0,
            y: 0,
            rotate: spec.rotate,
            opacity: 1,
            ease: 'back.out(1.1)',
            duration: 1.9,
            delay: spec.delay,
            scrollTrigger: { trigger: node, start: 'top 80%', once: true },
          },
        )
      })
    }, node)
    return () => context.revert()
  }, [ready, reduced])

  return (
    <div ref={root} className="flex flex-wrap items-center justify-center gap-x-3 gap-y-5">
      {subjects.map((s, i) => {
        const chip = cn(
          'inline-flex items-baseline gap-2 whitespace-nowrap rounded-full px-5 py-3 text-[16px] font-medium will-change-transform sm:px-7 sm:py-4 sm:text-[19px]',
          TONES[i % TONES.length],
        )
        return s.count > 0 ? (
          <Link
            key={s.value}
            href={`/academy?category=${s.value}#courses`}
            data-capsule
            className={cn(chip, 'transition-[filter] hover:brightness-110')}
          >
            {s.label}
            <span className="text-[0.8em] opacity-60 tabular-nums">{s.count}</span>
          </Link>
        ) : (
          <span key={s.value} data-capsule className={chip}>
            {s.label}
          </span>
        )
      })}
    </div>
  )
}
