'use client'

import * as React from 'react'
import { ScrollReveal } from '../motion/editorial-heading'
import { Typewriter } from '../motion/typewriter'
import { Doodle } from '../motion/doodle'
import { Parallax, ScrubWords } from '../motion/parallax'
import { METRICS } from '@/content/site/proof'

/**
 * The claim, set as a poster.
 *
 * One sentence at enormous scale with the load-bearing words in black and the
 * connective tissue in grey, which is how the reference makes a long statement
 * scannable without cutting it into bullet points. The sentence is the
 * existing platform argument, unchanged.
 *
 * The four figures are the real ones from the product — they are deliberately
 * modest, and scattering them as loose chips rather than ranking them in a row
 * stops the section from reading as a scoreboard we would lose.
 */

/** Placement is authored per chip: a grid here would flatten the composition. */
const CHIP_PLACEMENT = [
  'sm:col-start-1 sm:row-start-1 sm:translate-y-4',
  'sm:col-start-2 sm:row-start-1 sm:-translate-y-6',
  'sm:col-start-3 sm:row-start-1 sm:translate-y-10',
  'sm:col-start-4 sm:row-start-1 sm:-translate-y-2',
]

export function EditorialStatement() {
  return (
    <div id="platform" className="relative overflow-hidden px-[var(--gutter)] py-24 sm:py-36">
      <div className="mx-auto max-w-[76rem]">
        {/* Typed rather than masked: this one line is the section's claim, and
            watching it written holds the reader on it a beat longer. */}
        <Typewriter
          text="Everything your school needs. Connected."
          className="ed-display ed-display-md max-w-[22ch]"
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20">
          {/* Resolves grey to black word by word as it crosses the viewport,
              so the sentence is read rather than merely displayed. */}
          <ScrubWords
            className="max-w-[46ch] text-[clamp(1.05rem,1.5vw,1.3rem)] leading-[1.55]"
            text="Schools usually buy an SIS, an accounting package and a messaging tool, then spend the year reconciling them. MyCampusView is one system on one database — the student record admissions created is the record fees invoices, the register marks and the report card is built from."
          />

          <ScrollReveal from="right" delay={0.25} className="relative">
            <p className="max-w-[34ch] text-[15px] leading-[1.6] text-[var(--ed-ink-soft)]">
              Nothing above is synchronised overnight. There is one row, and these are eight views
              of it.
            </p>
            <Doodle
              name="spark"
              color="var(--ed-amber)"
              className="absolute -top-8 right-2 h-16 w-16 sm:h-20 sm:w-20"
              delay={300}
            />
          </ScrollReveal>
        </div>

        {/* The figures. Loose, overlapping the statement's lower margin. */}
        <div className="relative mt-20 sm:mt-28">
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-4 sm:gap-x-4">
            {METRICS.map((metric, index) => (
              <Parallax
                key={metric.label}
                speed={0.05 + (index % 3) * 0.045}
                rotate={index % 2 === 0 ? 3 : -3}
                className={CHIP_PLACEMENT[index] ?? ''}
              >
                <div className="flex flex-col items-center text-center">
                  <span className="grid aspect-square w-full max-w-[9.5rem] place-items-center rounded-full bg-[color-mix(in_srgb,var(--ed-ink)_5%,transparent)] px-4">
                    <span className="ed-display text-[clamp(1.8rem,3.4vw,2.9rem)] tabular-nums text-[var(--ed-ink)]">
                      {metric.value}
                    </span>
                  </span>
                  <span className="mt-4 max-w-[15ch] text-[13.5px] font-medium leading-[1.4] text-[var(--ed-ink)]">
                    {metric.label}
                  </span>
                  <span className="mt-1.5 max-w-[22ch] text-[12.5px] leading-[1.5] text-[var(--ed-ink-soft)]">
                    {metric.note}
                  </span>
                </div>
              </Parallax>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
