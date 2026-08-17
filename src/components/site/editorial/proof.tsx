'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { ScrollReveal } from '../motion/editorial-heading'
import { Typewriter } from '../motion/typewriter'
import { Doodle } from '../motion/doodle'
import { StoryFigure } from './story-figure'
import { Parallax } from '../motion/parallax'
import { SampleMark } from '../ui'
import { CASE_STUDIES } from '@/content/site/proof'
import { cn } from '@/lib/utils'

/**
 * Implementations, as an editorial spread.
 *
 * The reference fills this section with portraits. There are none here, and
 * inventing faces to sit above copy that is itself marked as a sample would be
 * the one genuinely dishonest thing on the page — so the composition is built
 * from the writing instead: irregular placement, wide margins, and the sample
 * marking left exactly where it already was.
 *
 * Each panel arrives on its own trajectory, which is what keeps a three-item
 * list from reading as three cards in a row.
 */

/** Authored offsets. The middle panel drops, the last rises. */
const OFFSET = ['lg:mt-0', 'lg:mt-24', 'lg:mt-10']
const FROM = ['left', 'up', 'right'] as const

export function EditorialProof() {
  return (
    <div id="stories" className="relative overflow-hidden px-[var(--gutter)] py-24 sm:py-32">
      <div className="mx-auto max-w-[78rem]">
        <div className="relative w-fit max-w-full">
          <Typewriter
            loop
            className="ed-display ed-display-md max-w-[20ch]"
            lines={[
              { soft: 'What an', text: 'implementation', softFirst: true },
              { text: 'looks like.', soft: '' },
            ]}
          />
          <Doodle
            name="star"
            color="var(--ed-amber)"
            className="absolute -right-16 -top-6 hidden h-14 w-14 sm:block"
            delay={420}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <p className="max-w-[52ch] text-[15.5px] leading-[1.6] text-[var(--ed-ink-soft)]">
            Three shapes an implementation takes, written up in full. They are marked as samples
            until a named school has approved its own.
          </p>
          <SampleMark />
        </div>

        <div className="mt-16 grid gap-10 sm:mt-20 lg:grid-cols-3 lg:gap-8">
          {CASE_STUDIES.map((study, index) => (
            <ScrollReveal
              key={study.school}
              from={FROM[index] ?? 'up'}
              delay={0.05 * index}
              className={cn(OFFSET[index] ?? '')}
            >
              {/* Each column also drifts at its own rate, so the spread keeps
                  rearranging itself for as long as it is on screen. */}
              <Parallax speed={0.04 + index * 0.05}>
              <article className="relative">
                {/* The figure stands in for the reference's photography,
                    carrying the school's shape instead of a face. Drawn, not
                    photographed — see `story-figure.tsx` for why. */}
                <div className="relative mb-7 flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl bg-[color-mix(in_srgb,var(--ed-ink)_5%,transparent)] p-7">
                  <StoryFigure index={index} className="absolute inset-x-0 top-0 h-[78%]" />
                  {/*
                    The drawing is kept clear of the name by height alone, and
                    then this fades whatever reaches the last quarter into the
                    ground, so a figure can never sit behind a word.
                  */}
                  <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[color-mix(in_srgb,var(--ed-ink)_5%,var(--ed-paper))] to-transparent" />
                  <p className="relative ed-display text-[clamp(1.4rem,2.2vw,1.9rem)] leading-[1.1] text-[var(--ed-ink)]">
                    {study.school}
                  </p>
                  <p className="relative mt-2 text-[13.5px] text-[var(--ed-ink-soft)]">
                    {study.location} · {study.size}
                  </p>
                </div>

                <dl className="space-y-4">
                  {[
                    ['Before', study.problem],
                    ['What changed', study.approach],
                    ['Now', study.outcome],
                  ].map(([term, detail]) => (
                    <div key={term}>
                      <dt className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-[var(--ed-ink-soft)]">
                        {term}
                      </dt>
                      <dd className="mt-1.5 text-[14.5px] leading-[1.6] text-[var(--ed-ink)]">
                        {detail}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
              </Parallax>
            </ScrollReveal>
          ))}
        </div>

        <div className="relative mt-16 flex justify-center">
          <Link href="/customers" className="ed-link text-[16px] text-[var(--ed-ink)]">
            Read the implementations in full
            <ArrowUpRight className="size-[1.05em]" aria-hidden />
          </Link>
          <Doodle
            name="flower"
            color="var(--ed-mint)"
            className="pointer-events-none absolute -top-10 right-[8%] hidden h-20 w-20 lg:block"
            delay={200}
          />
        </div>
      </div>
    </div>
  )
}
