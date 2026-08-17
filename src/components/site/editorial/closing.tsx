'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { HeroObjects } from '../motion/hero-objects'
import { EditorialHeading, ScrollReveal } from '../motion/editorial-heading'
import { Doodle } from '../motion/doodle'

/**
 * The ask.
 *
 * The reference closes on the same ground it opened on, with one object, one
 * line and one link — the restraint is the point, and a second call to action
 * here would undo it. The right-hand column from the previous closing section
 * is kept, because what a demonstration involves is the thing that actually
 * moves a director from reading to booking.
 *
 * One word in the headline is ringed by hand, which is the only decoration the
 * section gets.
 */
export function EditorialClosing() {
  return (
    <div id="demo" className="on-ed-black relative isolate overflow-hidden px-[var(--gutter)] py-28 sm:py-36">
      <HeroObjects className="pointer-events-none absolute inset-y-0 right-0 z-0 w-1/2 max-lg:hidden" />

      <div className="relative z-10 mx-auto max-w-[78rem]">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:gap-20">
          <div>
            <div className="relative inline-block">
              <EditorialHeading
                as="h2"
                size="md"
                className="max-w-[14ch] text-[var(--ed-on-black)]"
                lines={[
                  { text: 'Ready to run', soft: 'your' },
                  { soft: 'school on', text: 'one platform?', softFirst: true },
                ]}
              />
              {/* Rings "one platform" — the phrase the whole page argues for. */}
              <Doodle
                name="ring"
                color="var(--ed-amber)"
                width={2.2}
                className="pointer-events-none absolute bottom-[-6%] left-[26%] h-[2.4em] w-[52%]"
                delay={700}
              />
            </div>

            <ScrollReveal from="up" delay={0.2}>
              <p className="mt-10 max-w-[52ch] text-[16.5px] leading-[1.65] text-[var(--ed-on-black-soft)]">
                Tell us how your school runs today — what is on paper, what is in spreadsheets,
                what your current software does badly. The demonstration follows that rather than a
                script, and we will be straightforward about the modules that are not built yet.
              </p>

              <div className="mt-11 flex flex-wrap items-center gap-x-10 gap-y-4">
                <Link href="/book-demo" className="ed-link text-[19px] text-white">
                  Book a demo
                  <ArrowUpRight className="size-[1em]" aria-hidden />
                </Link>
                <Link
                  href="/contact"
                  className="ed-link text-[17px] text-[var(--ed-on-black-soft)] hover:text-white"
                >
                  Talk to our team
                </Link>
              </div>
            </ScrollReveal>
          </div>

          <ScrollReveal from="right" delay={0.3}>
            <div className="border-t border-white/12 pt-7 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
              <h3 className="text-[15px] font-semibold text-white">
                What a demonstration involves
              </h3>
              <ul className="mt-5 space-y-3.5">
                {[
                  'Thirty to forty minutes, on a call, with your screen or ours',
                  'Roughly how many students and staff you have',
                  'What you use today for fees and attendance',
                  'Whether you run one campus or several',
                ].map((item) => (
                  <li
                    key={item}
                    className="text-[14.5px] leading-[1.55] text-[var(--ed-on-black-soft)]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-7 text-[13.5px] leading-[1.6] text-white/40">
                No obligation, and no pricing pressure on the first call. If MyCampusView is the
                wrong fit for your school we would rather say so then.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </div>
  )
}
