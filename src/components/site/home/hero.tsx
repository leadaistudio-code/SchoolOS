import * as React from 'react'
import { Container } from '../container'
import { ConnectionGrid } from '../connection-grid'
import { Button } from '../ui'
import { DashboardRender } from '../product/dashboard-render'
import { POSITIONING } from '@/content/site/company'
import { MODULE_COUNTS } from '@/content/site/modules'

/**
 * Hero.
 *
 * Type on the left, the product on the right, both straight on. No tilt, no
 * browser chrome drawn in perspective, no collage of cards floating past the
 * headline: a school director is deciding whether this looks like real
 * software, and the fastest way to answer that is to show the software.
 *
 * The interface is deliberately cropped by the right edge of the viewport
 * rather than shrunk to fit. A dashboard scaled down until it fits neatly is
 * unreadable, which defeats the point of showing it; one that runs off the edge
 * reads at full size and implies there is more of it.
 */
export function Hero() {
  return (
    <div className="relative overflow-hidden border-b border-[var(--rule)] bg-[var(--paper)] pt-16 sm:pt-24">
      {/* One quiet ground, stopping well above the product so the interface
          reads at full contrast. Not a gradient wash across the fold. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[linear-gradient(180deg,var(--blue-tint)_0%,transparent_100%)] opacity-70"
        aria-hidden
      />

      {/* The lattice sits inside that same top band, so it is strongest behind
          the headline and gone by the time the dashboard starts. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px]" aria-hidden>
        <ConnectionGrid />
      </div>

      <Container wide className="relative">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,29rem)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
          <div data-reveal>
            <h1 className="display text-[clamp(2.6rem,5.4vw,4.1rem)]">
              One operating system for your entire school.
            </h1>
            <p className="muted mt-6 max-w-xl text-[19px] leading-[1.55]">
              {POSITIONING.lead}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href="/book-demo" size="lg">
                Book a demo
              </Button>
              <Button href="/product" tone="secondary" size="lg">
                Explore MyCampusView
              </Button>
            </div>

            <p className="subtle mt-8 max-w-md text-[15px] leading-[1.55]">
              {POSITIONING.trustLine} {MODULE_COUNTS.available} modules are available today, and
              this site labels the ones that are not.
            </p>
          </div>

          {/* Held to the right of the grid and allowed past the container edge,
              so the dashboard is shown at a size it can be read at rather than
              scaled down until the figures are decorative.

              The minimum width starts at `xl` on purpose: between 1024px and
              1280px the column is narrow enough that forcing 44rem would clip
              half the dashboard against the section's `overflow-hidden`. There
              it simply fills the column instead. */}
          <div className="relative lg:-mr-[max(0px,calc((100vw-var(--wide-max))/2))]">
            <div className="screen shadow-lift xl:min-w-[44rem]">
              <div className="screen-chrome">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="size-2.5 rounded-full bg-[var(--rule-strong)]" />
                  <span className="size-2.5 rounded-full bg-[var(--rule-strong)]" />
                  <span className="size-2.5 rounded-full bg-[var(--rule-strong)]" />
                </span>
                <span className="ml-1 truncate text-[13px] text-[var(--text-subtle)]">
                  MyCampusView — administrator dashboard
                </span>
              </div>
              <DashboardRender />
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
