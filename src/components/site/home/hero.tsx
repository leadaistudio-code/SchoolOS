import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Container } from '../container'
import { DashboardRender } from '../product/dashboard-render'

/**
 * Hero.
 *
 * Type, then product, straight on. No tilt, no browser chrome mocked in
 * perspective, no collage of floating cards: a school director is deciding
 * whether this looks like real software, and the fastest way to answer that is
 * to show the software.
 *
 * The composition holds the interface at the fold deliberately — the page
 * begins in the product rather than in an illustration of one.
 */
export function Hero() {
  return (
    <div className="relative overflow-hidden bg-[var(--paper)] pt-14 sm:pt-20">
      {/* A single quiet ground. Not a gradient wash: a plain tint that stops
          before the product so the interface reads at full contrast. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--indigo) 5%, transparent) 0%, transparent 100%)',
        }}
        aria-hidden
      />

      <Container className="relative">
        <div className="max-w-3xl">
          <h1 className="display text-[clamp(2.5rem,6.2vw,4.25rem)]">
            One system to run your school.
          </h1>
          <p className="muted mt-5 max-w-xl text-[19px] leading-[1.55]">
            Student records, attendance, fees, examinations, communication and transport share one
            database. Information entered once is correct everywhere.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/book-demo"
              className="rounded-lg bg-[var(--ink)] px-5 py-3 text-[16px] font-medium text-white transition-colors hover:bg-[var(--navy)]"
            >
              Book a demo
            </Link>
            <Link
              href="/product"
              className="group inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-strong)] px-5 py-3 text-[16px] font-medium text-[var(--text)] transition-colors hover:border-[var(--ink)]"
            >
              See how it fits together
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>

          <p className="subtle mt-6 text-[15px]">
            Built for private schools, international schools, preschools and multi-campus groups.
          </p>
        </div>
      </Container>

      {/* The product, wider than the text column and cropped by the fold. */}
      <Container wide className="relative mt-12 sm:mt-16">
        <div className="screen shadow-lift reveal">
          <div className="screen-chrome">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-[#e5e8f0]" />
              <span className="size-2.5 rounded-full bg-[#e5e8f0]" />
              <span className="size-2.5 rounded-full bg-[#e5e8f0]" />
            </span>
            <span className="ml-2 rounded-md bg-[var(--page)] px-2.5 py-1 text-[12px] text-[var(--text-subtle)]">
              stjohns.schoolos.app
            </span>
          </div>
          <DashboardRender />
        </div>
      </Container>
    </div>
  )
}
