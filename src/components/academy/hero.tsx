'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
import { HeroObjects } from '@/components/site/motion/hero-objects'
import { useReducedMotion } from '@/components/site/motion/provider'

const LINES = ['Build the robot.', 'Then teach it', 'to think.']

/**
 * The Academy's fold: the marketing site's black ground and glass, with the
 * solids cut into robot parts. The headline is masked per word and arrives on
 * load; everything else follows it in.
 */
export function AcademyHero({
  courseCount,
  primary,
}: {
  courseCount: number
  /** The second link, which depends on who is looking. */
  primary: { href: string; label: string }
}) {
  const reduced = useReducedMotion()
  const [entered, setEntered] = React.useState(false)

  React.useEffect(() => {
    if (reduced) {
      setEntered(true)
      return
    }
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  const fade = (delay: number, lift = 18): React.CSSProperties => ({
    opacity: entered ? 1 : 0,
    transform: entered ? 'translateY(0)' : `translateY(${lift}px)`,
    transition: reduced ? 'none' : `opacity 900ms ease ${delay}ms, transform 900ms var(--ed-ease) ${delay}ms`,
  })

  let index = 0

  return (
    <section className="ed-black-ground relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <HeroObjects arrangement="academy" className="pointer-events-none absolute inset-0 z-0" />

      <div className="relative z-10 flex flex-1 items-center px-[var(--gutter)] pb-24 pt-28">
        <div className="mx-auto w-full max-w-[72rem] text-center">
          <h1 className="ed-display ed-display-lg text-[var(--ed-on-black)]">
            {LINES.map((line, li) => (
              <span key={line} className="block">
                {line.split(' ').map((word, wi, words) => {
                  const i = index++
                  return (
                    <span key={wi} className="ed-word">
                      <span
                        className={li === 2 ? 'text-[var(--ed-amber)]' : undefined}
                        style={{
                          transform: entered ? 'translateY(0)' : 'translateY(106%)',
                          opacity: entered ? 1 : 0,
                          transition: reduced
                            ? 'none'
                            : `transform 1150ms var(--ed-ease) ${160 + i * 70}ms, opacity 700ms ease ${160 + i * 70}ms`,
                        }}
                      >
                        {word}
                        {wi < words.length - 1 ? '\u00a0' : ''}
                      </span>
                    </span>
                  )
                })}
              </span>
            ))}
          </h1>

          <p
            className="mx-auto mt-8 max-w-[40rem] text-[clamp(1rem,1.35vw,1.15rem)] leading-[1.6] text-[var(--ed-on-black-soft)]"
            style={fade(760)}
          >
            Robotics, AI and coding courses for school students. Short video lessons you can pause and
            build along with, quizzes that explain the answer, projects an instructor reviews, and a
            certificate at the end.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-9 gap-y-4" style={fade(920, 0)}>
            <Link href="#courses" className="ed-link text-[17px] text-white">
              See the courses
              <ArrowDown className="size-[1.05em]" aria-hidden />
            </Link>
            <Link href={primary.href} className="ed-link text-[17px] text-[var(--ed-on-black-soft)] hover:text-white">
              {primary.label}
              <ArrowUpRight className="size-[1.05em]" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      <p
        className="relative z-10 px-[var(--gutter)] pb-10 text-center text-[13.5px] leading-[1.6] text-[var(--ed-on-black-soft)]"
        style={fade(1080, 0)}
      >
        {courseCount === 0 ? 'Courses opening soon' : courseCount === 1 ? 'One course open now' : `${courseCount} courses open now`}
        <span className="mx-2 text-white/25">/</span>
        Pay once with UPI, card or net banking
        <span className="mx-2 text-white/25">/</span>
        <span className="text-white/70">Certificates anyone can verify</span>
      </p>
    </section>
  )
}
