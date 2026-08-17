'use client'

import * as React from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGsapReady, useReducedMotion } from './provider'
import { cn } from '@/lib/utils'

/**
 * Continuous, scroll-linked movement.
 *
 * A one-shot reveal animates once and then the page is a still image again,
 * which is what makes an otherwise well-composed site feel static. These are
 * scrubbed instead: the transform is a function of scroll position, so
 * everything keeps moving for as long as the reader does, and moving *back*
 * when they scroll up.
 *
 * `speed` is how far the element travels across its own passage through the
 * viewport, as a fraction of viewport height. Small numbers. Past about 0.25
 * the parallax stops reading as depth and starts reading as drift.
 */
export function Parallax({
  children,
  speed = 0.12,
  axis = 'y',
  rotate = 0,
  scaleTo,
  className,
}: {
  children: React.ReactNode
  speed?: number
  axis?: 'x' | 'y'
  /** Degrees of rotation across the passage. */
  rotate?: number
  /** Scale at the end of the passage; 1 means no scaling. */
  scaleTo?: number
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const ready = useGsapReady()
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const node = ref.current
    if (!ready || !node || reduced) return

    // Parallax parks its element at an offset before the trigger runs. If the
    // element is already on screen that offset never unwinds, so skip it.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.95) return

    const context = gsap.context(() => {
      const distance = () => window.innerHeight * speed

      gsap.fromTo(
        node,
        {
          [axis]: () => distance(),
          rotate: rotate ? -rotate / 2 : 0,
          scale: scaleTo != null ? 1 : 1,
        },
        {
          [axis]: () => -distance(),
          rotate: rotate ? rotate / 2 : 0,
          scale: scaleTo ?? 1,
          ease: 'none',
          scrollTrigger: {
            trigger: node,
            // From the element entering the viewport to it leaving, so the
            // movement is spread across the whole time it is on screen.
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        },
      )
    }, node)

    return () => context.revert()
  }, [ready, reduced, speed, axis, rotate, scaleTo])

  return (
    <div ref={ref} className={cn('will-change-transform', className)}>
      {children}
    </div>
  )
}

/**
 * Type that resolves as it is read.
 *
 * The reference's long statements start grey and arrive at black word by word
 * as the section crosses the viewport. Doing it per word rather than per line
 * is what makes it feel like reading rather than like a fade.
 *
 * The text is authored as a single string and split here, so the markup stays
 * one readable sentence for a screen reader and for search.
 */
export function ScrubWords({
  text,
  className,
  from = 'var(--ed-ink-soft)',
  to = 'var(--ed-ink)',
}: {
  text: string
  className?: string
  from?: string
  to?: string
}) {
  const ref = React.useRef<HTMLParagraphElement>(null)
  const ready = useGsapReady()
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const node = ref.current
    if (!ready || !node) return

    const words = node.querySelectorAll<HTMLElement>('[data-word]')
    if (!words.length) return

    if (reduced) {
      gsap.set(words, { color: to })
      return
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        words,
        { color: from },
        {
          color: to,
          ease: 'none',
          stagger: 1,
          scrollTrigger: {
            trigger: node,
            // Resolves across the middle band of the viewport, so the sentence
            // is fully black by the time it sits where it is comfortably read.
            start: 'top 82%',
            end: 'bottom 55%',
            scrub: 0.5,
            invalidateOnRefresh: true,
          },
        },
      )
    }, node)

    return () => context.revert()
  }, [ready, reduced, from, to])

  return (
    <p ref={ref} className={className}>
      {text.split(' ').map((word, index) => (
        <span key={index} data-word style={{ color: from }}>
          {word}
          {index < text.split(' ').length - 1 ? ' ' : ''}
        </span>
      ))}
    </p>
  )
}
