import * as React from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Container, Section } from '../container'
import { Typewriter } from '../motion/typewriter'
import { Doodle } from '../motion/doodle'
import { DashboardRender } from '../product/dashboard-render'
import { CORE_PRODUCTS } from '@/content/site/company'

/**
 * The product, told rather than listed.
 *
 * One board and the three products that read from it. The board is the real
 * dashboard — the application's own components against sample figures — and the
 * three products beside it are the argument the board is evidence for: one
 * record, entered once, that admissions, records and the office all read.
 *
 * This was a pinned section that swapped one product at a time as you scrolled.
 * It was removed rather than repaired. Pinning cost a reader three screens of
 * scrolling to reach three paragraphs they could otherwise take in at a glance,
 * it hid two thirds of the argument behind a scroll position at any moment, and
 * it could not fit a laptop viewport without clipping its own headline. The
 * three products are short enough to be read together, so they are.
 *
 * Nothing here is stateful, so the file carries no `use client` and the section
 * ships no JavaScript of its own — only the heading and the doodle, which bring
 * their own.
 */
export function EditorialFeatures() {
  return (
    <Section id="product">
      <Container wide>
        <div className="relative flex items-start justify-between gap-8">
          <Typewriter
            loop
            className="ed-display ed-display-md max-w-[16ch]"
            lines={[
              { text: 'One record.', soft: 'Three' },
              { soft: 'products that', text: 'read it.', softFirst: true },
            ]}
          />

          <div className="relative hidden shrink-0 pt-3 sm:block">
            <Link href="/product" className="ed-link text-[15px] text-[var(--ed-ink)]">
              See the product
              <ArrowUpRight className="size-[1.05em]" aria-hidden />
            </Link>
            <Doodle
              name="smile"
              color="var(--ed-sky)"
              width={2}
              className="pointer-events-none absolute -right-2 top-12 h-24 w-24 lg:h-32 lg:w-32"
              delay={400}
            />
          </div>
        </div>

        <div className="mt-12 grid gap-10 lg:mt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
          {/*
            No fixed aspect ratio on the frame. The board used to sit in a
            16/11 window with the overflow hidden, which cropped the charts
            mid-axis at the bottom edge — a real dashboard cut off looks like a
            rendering fault, not like a detail shot. It is given its own height
            instead.
          */}
          <div className="overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--ed-ink)_10%,transparent)] bg-white">
            <DashboardRender view="all" />
          </div>

          <ol className="space-y-10">
            {CORE_PRODUCTS.map((product) => (
              <li key={product.key}>
                <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--ed-ink-soft)]">
                  {product.abbr}
                </p>
                <h3 className="ed-display ed-display-sm mt-2 text-[var(--ed-ink)]">
                  {product.name}
                </h3>
                <p className="mt-3 max-w-[42ch] text-[15.5px] leading-[1.6] text-[var(--ed-ink-soft)]">
                  {product.lead}
                </p>
                <Link
                  href={product.href}
                  className="ed-link mt-4 text-[14.5px] text-[var(--ed-ink)]"
                >
                  {product.name}
                  <ArrowUpRight className="size-[1em]" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  )
}
