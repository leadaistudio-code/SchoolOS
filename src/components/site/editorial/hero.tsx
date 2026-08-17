'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { HeroObjects } from '../motion/hero-objects'
import { useReducedMotion } from '../motion/provider'
import { POSITIONING } from '@/content/site/company'
import { MODULE_COUNTS } from '@/content/site/modules'
import { cn } from '@/lib/utils'

/**
 * The fold.
 *
 * Type is centred with the objects behind it, which is where the depth comes
 * from — the headline sits inside the arrangement rather than beside it.
 *
 * There is exactly one canvas. An earlier version drew a second copy in front,
 * clipped to the outer thirds, so a solid could cross the type. Two renderers
 * running their own clocks and their own pointer damping drift apart by a
 * frame or two, and the offset duplicate read as a shadow around every object
 * in the clipped region. It also doubled the WebGL cost for the effect.
 *
 * The headline is the one piece of type on the page that does not wait for
 * scroll: it animates on load, in front of everything else, because it is what
 * the visitor came to read.
 */
export function EditorialHero() {
  const reduced = useReducedMotion()
  const [entered, setEntered] = React.useState(false)

  React.useEffect(() => {
    if (reduced) {
      setEntered(true)
      return
    }
    // One frame, so the initial state paints before the transition begins.
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  const words = POSITIONING.promise.replace(/\.$/, '').split(' ')

  return (
    <section
      id="top"
      className="ed-black-ground relative isolate flex min-h-[100svh] flex-col overflow-hidden"
    >
      {/* Behind the type. */}
      <HeroObjects className="pointer-events-none absolute inset-0 z-0" />

      <div className="relative z-10 flex flex-1 flex-col">
        <HeroChrome entered={entered} />

        <div className="flex flex-1 items-center px-[var(--gutter)] pb-28 pt-6 sm:pb-32">
          <div className="mx-auto w-full max-w-[72rem] text-center">
            <h1 className="ed-display ed-display-lg text-[var(--ed-on-black)]">
              {/* Word-level masking rather than per-character: the reference
                  reveals language, and letters arriving one by one turns a
                  sentence into an effect. */}
              {words.map((word, index) => (
                <span key={index} className="ed-word">
                  <span
                    className="inline-block will-change-transform"
                    style={{
                      transform: entered ? 'translateY(0)' : 'translateY(106%)',
                      opacity: entered ? 1 : 0,
                      transition: reduced
                        ? 'none'
                        : `transform 1150ms var(--ed-ease) ${180 + index * 62}ms, opacity 700ms ease ${180 + index * 62}ms`,
                    }}
                  >
                    {word}
                    {index < words.length - 1 ? ' ' : ''}
                  </span>
                </span>
              ))}
            </h1>

            <p
              className="mx-auto mt-8 max-w-[38rem] text-[clamp(1rem,1.35vw,1.15rem)] leading-[1.6] text-[var(--ed-on-black-soft)]"
              style={{
                opacity: entered ? 1 : 0,
                transform: entered ? 'translateY(0)' : 'translateY(18px)',
                transition: reduced
                  ? 'none'
                  : 'opacity 900ms ease 720ms, transform 900ms var(--ed-ease) 720ms',
              }}
            >
              {POSITIONING.lead}
            </p>

            <div
              className="mt-10 flex flex-wrap items-center justify-center gap-x-9 gap-y-4"
              style={{
                opacity: entered ? 1 : 0,
                transition: reduced ? 'none' : 'opacity 900ms ease 900ms',
              }}
            >
              <Link href="/book-demo" className="ed-link text-[17px] text-white">
                Book a demo
                <ArrowUpRight className="size-[1.05em]" aria-hidden />
              </Link>
              <Link
                href="/product"
                className="ed-link text-[17px] text-[var(--ed-on-black-soft)] hover:text-white"
              >
                Explore MyCampusView
              </Link>
            </div>
          </div>
        </div>

        <p
          className="px-[var(--gutter)] pb-24 text-center text-[13.5px] leading-[1.6] text-[var(--ed-on-black-soft)] sm:pb-28"
          style={{
            opacity: entered ? 1 : 0,
            transition: reduced ? 'none' : 'opacity 900ms ease 1080ms',
          }}
        >
          {POSITIONING.trustLine}{' '}
          <span className="text-white/70">
            {MODULE_COUNTS.available} modules available today.
          </span>
        </p>
      </div>

    </section>
  )
}

/**
 * The hero's own header.
 *
 * The site header is hidden over the fold and the marks live here instead, so
 * the top of the page is the wordmark and one action — the reference's
 * restraint depends on the fold not carrying a full navigation bar.
 */
function HeroChrome({ entered }: { entered: boolean }) {
  return (
    <div
      className="flex items-center justify-between px-[var(--gutter)] pt-7"
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateY(0)' : 'translateY(-12px)',
        transition: 'opacity 800ms ease 1000ms, transform 800ms var(--ed-ease) 1000ms',
      }}
    >
      <Link href="/" aria-label="MyCampusView home" className="flex items-center gap-2.5">
        <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
          <rect width="32" height="32" rx="8" fill="#fff" />
          <g stroke="var(--ed-black)" strokeWidth="2" strokeLinecap="round">
            <path d="M9 12h14M9 17h14M9 22h8" opacity="0.9" />
          </g>
          <circle cx="23.5" cy="22" r="2.5" fill="var(--ed-mint)" />
        </svg>
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-white">
          MyCampusView
        </span>
      </Link>

      <div className="flex items-center gap-2">
        <Link
          href="/sign-in"
          className="hidden rounded-full px-4 py-2 text-[14.5px] text-white/65 transition-colors duration-200 hover:text-white sm:block"
        >
          Sign in
        </Link>
        <Link
          href="/book-demo"
          className={cn(
            'rounded-full bg-white px-4 py-2 text-[14.5px] font-medium text-[var(--ed-black)]',
            'transition-transform duration-300 hover:scale-[1.03]',
          )}
        >
          Book a demo
        </Link>
      </div>
    </div>
  )
}
