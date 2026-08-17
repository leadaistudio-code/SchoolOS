'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Hand-drawn accents.
 *
 * A closed family of six, all drawn at the same nominal stroke weight and with
 * the same loose, slightly-off geometry, so they read as one hand rather than
 * as clip art gathered from six places. They exist to mark one word or one
 * corner — used more than a few times on a page they stop being an accent and
 * become a texture.
 *
 * Each draws itself once on arrival, then holds.
 */
const PATHS = {
  /** Loose ellipse for ringing a word. */
  ring: {
    box: '0 0 220 84',
    len: 520,
    d: 'M110 6C58 4 12 20 7 44c-5 25 44 36 104 36 57 0 102-13 102-36C213 20 165 8 110 6c-9 0-19 1-28 3',
  },
  /** Underline with a return stroke. */
  underline: {
    box: '0 0 200 26',
    len: 340,
    d: 'M6 15c38-6 122-11 188-7M14 21c46-6 108-9 170-6',
  },
  /** The smile from the reference's feature section. */
  smile: {
    box: '0 0 120 120',
    len: 460,
    d: 'M60 4C29 4 4 29 4 60s25 56 56 56 56-25 56-56S91 4 60 4M38 74c6 12 16 18 27 18 12 0 21-7 26-19-17 3-36 3-53 1',
  },
  /** A sun, for the statement section. */
  spark: {
    box: '0 0 100 100',
    len: 300,
    d: 'M50 30a20 20 0 100 40 20 20 0 100-40M50 8v10M50 82v10M8 50h10M82 50h10M20 20l7 7M73 73l7 7M80 20l-7 7M27 73l-7 7',
  },
  /** A single looping curl. */
  loop: {
    box: '0 0 140 60',
    len: 280,
    d: 'M6 42c22-40 52-44 62-18 7 18-14 30-22 18-9-14 14-34 44-24 14 5 30 18 44 34',
  },
  /** A directional arrow with a hand-drawn head. */
  arrow: {
    box: '0 0 120 48',
    len: 240,
    d: 'M4 26c30-10 66-14 108-6M92 8c8 6 14 10 20 12-8 4-14 9-19 16',
  },
  /** Four-point sparkle, for the proof section. */
  star: {
    box: '0 0 100 100',
    len: 300,
    d: 'M50 6c2 22 10 36 30 42-20 6-28 20-30 44-2-24-10-38-30-44 20-6 28-20 30-42',
  },
  /** A loose heart. */
  heart: {
    box: '0 0 100 92',
    len: 280,
    d: 'M50 84C26 66 8 50 8 32 8 18 18 8 31 8c8 0 15 4 19 11 4-7 11-11 19-11 13 0 23 10 23 24 0 18-18 34-42 52',
  },
  /** Five petals and a stem. */
  flower: {
    box: '0 0 110 120',
    len: 420,
    d: 'M55 44a13 13 0 100-26 13 13 0 100 26M34 60a13 13 0 10-8-25 13 13 0 108 25M76 60a13 13 0 118-25 13 13 0 01-8 25M42 84a13 13 0 11-5-25 13 13 0 015 25M68 84a13 13 0 105-25 13 13 0 00-5 25M55 88v28',
  },
} as const

export type DoodleName = keyof typeof PATHS

export function Doodle({
  name,
  className,
  color = 'currentColor',
  width = 2.4,
  delay = 0,
}: {
  name: DoodleName
  className?: string
  color?: string
  width?: number
  delay?: number
}) {
  const ref = React.useRef<SVGSVGElement>(null)
  const shape = PATHS[name]

  React.useEffect(() => {
    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-drawn')
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-drawn')
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.4 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <svg
      ref={ref}
      viewBox={shape.box}
      fill="none"
      aria-hidden
      className={cn('ed-doodle pointer-events-none', className)}
      style={{ ['--len' as string]: shape.len, ['--delay' as string]: `${delay}ms` }}
    >
      <path
        d={shape.d}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
