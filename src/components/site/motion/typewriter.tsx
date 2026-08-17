'use client'

import * as React from 'react'
import { useReducedMotion } from './provider'
import { cn } from '@/lib/utils'

/**
 * Type that types itself.
 *
 * Starts when the heading arrives on screen, not on mount, so it is not
 * already finished by the time it is scrolled to. Runs once.
 *
 * Two things keep this from costing accessibility. The full string is always
 * present in the DOM inside a visually-hidden span, so a screen reader and a
 * crawler read the finished sentence rather than a fragment; the animated copy
 * is `aria-hidden`. And the element reserves its final height from the first
 * frame, so nothing below it moves as the characters land — a typewriter that
 * reflows the page on every keystroke is the usual reason this effect feels
 * cheap.
 */
export function Typewriter({
  text,
  className,
  as: Tag = 'h2',
  /** Milliseconds per character. */
  speed = 42,
  startDelay = 200,
}: {
  text: string
  className?: string
  as?: 'h1' | 'h2' | 'h3' | 'p'
  speed?: number
  startDelay?: number
}) {
  const ref = React.useRef<HTMLElement>(null)
  const [typed, setTyped] = React.useState(0)
  const [started, setStarted] = React.useState(false)
  const reduced = useReducedMotion()

  // Arrival.
  React.useEffect(() => {
    const node = ref.current
    if (!node || started) return

    if (reduced || typeof IntersectionObserver === 'undefined') {
      setStarted(true)
      setTyped(text.length)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setStarted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [started, reduced, text.length])

  // The keystrokes.
  React.useEffect(() => {
    if (!started || reduced) return
    if (typed >= text.length) return

    const delay = typed === 0 ? startDelay : speed
    const timer = setTimeout(() => setTyped((n) => n + 1), delay)
    return () => clearTimeout(timer)
  }, [started, typed, text.length, speed, startDelay, reduced])

  const done = typed >= text.length

  return (
    <Tag ref={ref as never} className={className}>
      {/* The whole sentence, for anything that does not watch it being typed. */}
      <span className="sr-only">{text}</span>

      {/* The visible copy. Grid-stacked with a transparent full-length twin so
          the block already occupies its final height and nothing below it
          shifts while the characters arrive. */}
      <span aria-hidden className="grid">
        <span className="invisible col-start-1 row-start-1">{text}</span>
        <span className={cn('col-start-1 row-start-1', className && 'contents')}>
          {text.slice(0, typed)}
          <span className="ed-caret" data-done={done ? 'true' : 'false'} />
        </span>
      </span>
    </Tag>
  )
}
