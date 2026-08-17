'use client'

import * as React from 'react'
import { useReducedMotion } from './provider'
import { cn } from '@/lib/utils'

/**
 * Type that types itself.
 *
 * Starts when the heading arrives on screen, not on mount, so it is not
 * already finished by the time it is scrolled to.
 *
 * Takes either a flat `text` or the same `lines` structure `EditorialHeading`
 * uses. The second form matters: the grey/soft and black/strong word mix is
 * what carries the hierarchy in these headings, and typing a heading as one
 * flat string would throw that away to gain the effect.
 *
 * Three things keep this from costing accessibility. The full string is always
 * present in the DOM inside a visually-hidden span, so a screen reader and a
 * crawler read the finished sentence rather than a fragment, and the animated
 * copy is `aria-hidden`. The element reserves its final height from the first
 * frame, so nothing below it moves as the characters land — a typewriter that
 * reflows the page on every keystroke is the usual reason this effect feels
 * cheap. And under `prefers-reduced-motion` the whole thing renders finished
 * and still, with no frame ever scheduled.
 *
 * Looping runs type → hold → delete → hold → type, and only while the heading
 * is actually on screen: an unobserved loop would keep four headings elsewhere
 * on the page waking the main thread forever.
 */

export type TypedLine = {
  /** Rendered in the strong colour. */
  text?: string
  /** Rendered grey. Sits inline with `text` in the order given. */
  soft?: string
  /** Grey first, then strong — for lines that open quietly. */
  softFirst?: boolean
  /**
   * Rendered in the accent colour, always last on the line. For the one word a
   * heading is actually about — the grey/black split carries hierarchy, but it
   * cannot make a single word the point of the sentence.
   */
  accent?: string
}

type Tone = 'strong' | 'soft' | 'accent'
type Segment = { value: string; tone: Tone }

/** Matches `EditorialHeading`'s ordering exactly, including the joining space. */
function toSegments(line: TypedLine): Segment[] {
  const body: Segment[] = !line.soft
    ? line.text
      ? [{ value: line.text, tone: 'strong' }]
      : []
    : !line.text
      ? [{ value: line.soft, tone: 'soft' }]
      : line.softFirst
        ? [
            { value: `${line.soft} `, tone: 'soft' },
            { value: line.text, tone: 'strong' },
          ]
        : [
            { value: line.text, tone: 'strong' },
            { value: ` ${line.soft}`, tone: 'soft' },
          ]

  if (!line.accent) return body
  return [...body, { value: body.length ? ` ${line.accent}` : line.accent, tone: 'accent' }]
}

type Phase = 'typing' | 'holding' | 'deleting' | 'waiting'

export function Typewriter({
  text,
  lines,
  className,
  as: Tag = 'h2',
  /** Milliseconds per character. */
  speed = 42,
  startDelay = 200,
  /** Deleting reads as mechanical at the typing speed, so it runs quicker. */
  deleteSpeed = 22,
  loop = false,
  /** The colour the `accent` parts take. A class, so it can be per-ground. */
  accentClassName = 'text-[var(--ed-sky)]',
  /** How long the finished sentence stands before it is taken away. */
  holdDone = 2200,
  /** How long the empty line sits before it is typed again. */
  holdEmpty = 600,
}: {
  text?: string
  lines?: TypedLine[]
  className?: string
  as?: 'h1' | 'h2' | 'h3' | 'p'
  speed?: number
  startDelay?: number
  deleteSpeed?: number
  loop?: boolean
  accentClassName?: string
  holdDone?: number
  holdEmpty?: number
}) {
  const ref = React.useRef<HTMLElement>(null)
  const live = React.useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()

  const composed = React.useMemo(() => {
    const source: TypedLine[] = lines ?? (text ? [{ text }] : [])
    const perLine = source.map(toSegments)
    const plain = perLine.map((segments) => segments.map((s) => s.value).join('')).join(' ')
    const total = perLine.reduce(
      (sum, segments) => sum + segments.reduce((n, s) => n + s.value.length, 0),
      0,
    )
    return { perLine, plain, total }
  }, [lines, text])

  const [onScreen, setOnScreen] = React.useState(false)
  const [arrived, setArrived] = React.useState(false)

  // The cycle's own state, in refs: the loop advances it without re-rendering,
  // and a heading scrolled away and returned to resumes where it stopped.
  const typedRef = React.useRef(-1)
  const phaseRef = React.useRef<Phase>('typing')
  const firstRun = React.useRef(true)

  // Arrival, and — for a loop — departure. The observer is kept alive rather
  // than disconnected on first sight, so a heading that scrolls away stops
  // doing work instead of typing to nobody.
  React.useEffect(() => {
    const node = ref.current
    if (!node) return

    if (reduced || typeof IntersectionObserver === 'undefined') {
      setArrived(true)
      setOnScreen(false)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setOnScreen(entry.isIntersecting)
          if (entry.isIntersecting) setArrived(true)
        }
      },
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [reduced])

  /*
   * The keystrokes.
   *
   * Two things here are deliberate and both were learned the hard way.
   *
   * The count comes from elapsed time, not from one timer per character. A
   * `setTimeout` chain makes every character pay for a render and a fresh
   * timer ON TOP of its delay, and the error accumulates — a heading asked to
   * type at 42ms a character measured 250ms and upwards.
   *
   * And the characters are written straight to the DOM rather than through
   * React state. Re-rendering a heading twenty-four times a second is what a
   * typewriter naively costs, and measured on this page it took the whole
   * document from 17ms a frame to 150ms a frame — six frames a second, with
   * the smooth-scrolling layer sharing that same main thread, which reads to a
   * reader as the page having stopped scrolling altogether. The markup below
   * is rendered once and never re-rendered; this loop only edits text.
   */
  React.useEffect(() => {
    const host = live.current
    if (!host) return

    const nodes = Array.from(host.querySelectorAll<HTMLElement>('[data-segment]'))
    const carets = Array.from(host.querySelectorAll<HTMLElement>('[data-caret]'))
    const total = composed.total

    // Character offset of each segment, and the line it belongs to.
    const offsets: { start: number; line: number; value: string }[] = []
    let cursor = 0
    composed.perLine.forEach((segments, lineIndex) => {
      for (const segment of segments) {
        offsets.push({ start: cursor, line: lineIndex, value: segment.value })
        cursor += segment.value.length
      }
    })

    const paint = (count: number) => {
      if (count === typedRef.current) return
      typedRef.current = count

      let line = 0
      offsets.forEach((offset, index) => {
        const node = nodes[index]
        if (!node) return
        const shown = Math.min(offset.value.length, Math.max(0, count - offset.start))
        const next = offset.value.slice(0, shown)
        if (node.textContent !== next) node.textContent = next
        if (count > offset.start) line = offset.line
      })

      // The caret belongs to the line the count has reached.
      carets.forEach((caret, index) => {
        caret.style.display = index === line ? '' : 'none'
      })
    }

    const settle = (done: boolean) => {
      for (const caret of carets) caret.dataset.done = done ? 'true' : 'false'
    }

    if (reduced) {
      paint(total)
      settle(true)
      return
    }

    // Held at the finished sentence until it is actually looked at, so a
    // heading below the fold is never caught mid-word on arrival.
    if (!arrived) {
      paint(total)
      settle(!loop)
      return
    }
    if (!onScreen) return

    if (firstRun.current) paint(0)
    settle(false)

    let frame = 0
    let anchor = performance.now()
    let base = typedRef.current < 0 ? 0 : typedRef.current
    if (phaseRef.current === 'typing' && firstRun.current) anchor += startDelay

    const enter = (next: Phase, at: number, from: number) => {
      phaseRef.current = next
      anchor = at
      base = from
    }

    const step = (now: number) => {
      frame = requestAnimationFrame(step)
      const elapsed = now - anchor

      switch (phaseRef.current) {
        case 'typing': {
          if (elapsed < 0) return
          const next = Math.min(total, base + Math.floor(elapsed / speed))
          paint(next)
          if (next >= total) {
            firstRun.current = false
            enter('holding', now, total)
            if (!loop) {
              settle(true)
              cancelAnimationFrame(frame)
            }
          }
          return
        }
        case 'holding': {
          if (loop && elapsed >= holdDone) enter('deleting', now, total)
          return
        }
        case 'deleting': {
          const next = Math.max(0, base - Math.floor(elapsed / deleteSpeed))
          paint(next)
          if (next <= 0) enter('waiting', now, 0)
          return
        }
        default: {
          if (elapsed >= holdEmpty) enter('typing', now, 0)
        }
      }
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [
    reduced,
    arrived,
    onScreen,
    composed,
    speed,
    startDelay,
    deleteSpeed,
    loop,
    holdDone,
    holdEmpty,
  ])

  return (
    <Tag ref={ref as never} className={className}>
      {/* The whole sentence, for anything that does not watch it being typed. */}
      <span className="sr-only">{composed.plain}</span>

      {/* Grid-stacked with a full-length twin, so the block already occupies
          its final height and nothing below it shifts while characters land. */}
      <span aria-hidden className="grid">
        <span className="invisible col-start-1 row-start-1">
          {composed.perLine.map((segments, index) => (
            <span className="block" key={index}>
              {segments.map((segment, position) => (
                <span key={position}>{segment.value}</span>
              ))}
            </span>
          ))}
        </span>

        {/*
          Rendered complete and then emptied by the effect, so the heading is
          whole for a reader without JavaScript and for anything that reads the
          markup rather than running it. React renders this once; from then on
          the loop above owns the text of these spans.
        */}
        <span ref={live} className="col-start-1 row-start-1">
          {composed.perLine.map((segments, index) => (
            <span className="block" key={index}>
              {segments.map((segment, position) => (
                <span
                  data-segment
                  className={cn(
                    segment.tone === 'soft' && 'ed-soft',
                    segment.tone === 'accent' && accentClassName,
                  )}
                  key={position}
                >
                  {segment.value}
                </span>
              ))}
              <span
                data-caret
                className="ed-caret"
                data-done="true"
                style={{
                  display: index === composed.perLine.length - 1 ? undefined : 'none',
                }}
              />
            </span>
          ))}
        </span>
      </span>
    </Tag>
  )
}
