'use client'

import * as React from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGsapReady, useReducedMotion } from './provider'
import { cn } from '@/lib/utils'

/**
 * Poster typography that arrives a line at a time.
 *
 * The heading is authored as lines rather than as one string, because where a
 * line breaks is a design decision here and not something to leave to the
 * measure. Each line is masked and rises off its own baseline, staggered — the
 * reference's reveal reads as type setting itself, which a block fade cannot
 * imitate.
 *
 * `soft` marks the words that carry less of the argument. They are rendered in
 * grey against the same line, which is what produces the reference's hierarchy
 * without a second type size or a second weight.
 */
export type HeadingLine = {
  /** Rendered in the strong colour. */
  text?: string
  /** Rendered grey. Sits inline with `text` in the order given. */
  soft?: string
  /** Grey first, then strong — for lines that open quietly. */
  softFirst?: boolean
}

export function EditorialHeading({
  lines,
  as: Tag = 'h2',
  size = 'md',
  className,
  align = 'left',
  delay = 0,
}: {
  lines: HeadingLine[]
  as?: 'h1' | 'h2' | 'h3' | 'p'
  size?: 'lg' | 'md' | 'sm'
  className?: string
  align?: 'left' | 'center'
  delay?: number
}) {
  const ref = React.useRef<HTMLElement>(null)
  const ready = useGsapReady()
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const node = ref.current
    if (!ready || !node) return

    const spans = node.querySelectorAll<HTMLElement>('.ed-line > span')
    if (!spans.length) return

    if (reduced) {
      gsap.set(spans, { yPercent: 0, opacity: 1 })
      return
    }

    // Fail-safe: only hide what is genuinely below the fold at mount. If the
    // page was opened at a hash, or restored mid-document, the trigger for an
    // element already on screen may never fire — and a heading stuck at
    // opacity 0 forever is a far worse outcome than a missing animation. This
    // left whole sections of the page blank.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.95) {
      gsap.set(spans, { yPercent: 0, opacity: 1 })
      return
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        spans,
        { yPercent: 108, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 1.05,
          ease: 'power3.out',
          // Lines land in quick succession rather than as a queue; past about
          // 0.09 the last line arrives after the reader has already left.
          stagger: 0.075,
          delay,
          scrollTrigger: {
            trigger: node,
            start: 'top 88%',
            once: true,
          },
        },
      )
    }, node)

    return () => context.revert()
  }, [ready, reduced, delay])

  return (
    <Tag
      ref={ref as never}
      className={cn(
        'ed-display',
        size === 'lg' ? 'ed-display-lg' : size === 'sm' ? 'ed-display-sm' : 'ed-display-md',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {lines.map((line, index) => (
        <span className="ed-line" key={index}>
          <span>
            {line.softFirst ? (
              <>
                {line.soft ? <span className="ed-soft">{line.soft} </span> : null}
                {line.text}
              </>
            ) : (
              <>
                {line.text}
                {line.soft ? <span className="ed-soft"> {line.soft}</span> : null}
              </>
            )}
          </span>
        </span>
      ))}
    </Tag>
  )
}

/**
 * Anything that is not type: images, panels, figures.
 *
 * Deliberately not "fade up 20px on everything" — the caller chooses a
 * trajectory, so a panel can rise while an image beside it scales and a figure
 * beneath it slides in from the side.
 */
export function ScrollReveal({
  children,
  className,
  from = 'up',
  distance = 42,
  duration = 0.95,
  delay = 0,
  stagger = 0,
  start = 'top 86%',
}: {
  children: React.ReactNode
  className?: string
  from?: 'up' | 'left' | 'right' | 'scale' | 'mask'
  distance?: number
  duration?: number
  delay?: number
  stagger?: number
  start?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const ready = useGsapReady()
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const node = ref.current
    if (!ready || !node) return

    const targets = stagger > 0 ? Array.from(node.children) : [node]

    if (reduced) {
      gsap.set(targets, { clearProps: 'all', opacity: 1 })
      return
    }

    // Same fail-safe as above: anything already on screen renders as-is.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.95) {
      gsap.set(targets, { clearProps: 'all', opacity: 1 })
      return
    }

    const start_ = {
      up: { y: distance, opacity: 0 },
      left: { x: -distance, opacity: 0 },
      right: { x: distance, opacity: 0 },
      scale: { scale: 0.94, opacity: 0 },
      mask: { clipPath: 'inset(0 0 100% 0)', y: distance * 0.4, opacity: 1 },
    }[from]

    const end = {
      up: { y: 0, opacity: 1 },
      left: { x: 0, opacity: 1 },
      right: { x: 0, opacity: 1 },
      scale: { scale: 1, opacity: 1 },
      mask: { clipPath: 'inset(0 0 0% 0)', y: 0, opacity: 1 },
    }[from]

    const context = gsap.context(() => {
      gsap.fromTo(targets, start_, {
        ...end,
        duration,
        delay,
        stagger,
        ease: from === 'mask' ? 'power3.inOut' : 'power3.out',
        scrollTrigger: { trigger: node, start, once: true },
      })
    }, node)

    return () => context.revert()
  }, [ready, reduced, from, distance, duration, delay, stagger, start])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
