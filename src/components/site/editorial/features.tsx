'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EditorialHeading } from '../motion/editorial-heading'
import { Doodle } from '../motion/doodle'
import { useGsapReady, useReducedMotion } from '../motion/provider'
import { DashboardRender, AttendanceRender } from '../product/dashboard-render'
import { CORE_PRODUCTS } from '@/content/site/company'
import { cn } from '@/lib/utils'

/**
 * The product, told rather than listed.
 *
 * The heading holds still while the composition beneath it changes: on the
 * left the interface being described, on the right the three products stacked,
 * with the one currently on screen in black and the others dropped back to
 * grey. Scrolling moves through them continuously — no slider, no dots, and no
 * state that can be reached by clicking something the eye has not arrived at.
 *
 * The pin is desktop-only. On a phone the same three products are simply read
 * in order at full contrast, because pinning a section on a short viewport
 * costs the reader control of the page and buys nothing.
 */

/** The visual for each product. Real renders — nothing mocked up for the page. */
const VISUALS = [
  () => <AttendanceRender />,
  () => <DashboardRender view="all" />,
  () => <DashboardRender view="charts" />,
]

export function EditorialFeatures() {
  const root = React.useRef<HTMLDivElement>(null)
  const [active, setActive] = React.useState(0)
  const ready = useGsapReady()
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const node = root.current
    if (!ready || !node) return
    if (reduced || window.innerWidth < 1024) return

    const context = gsap.context(() => {
      ScrollTrigger.create({
        trigger: node,
        start: 'top top',
        // One viewport of scroll per product after the first, so each gets the
        // same dwell and the section cannot outrun the reader.
        end: () => `+=${window.innerHeight * CORE_PRODUCTS.length}`,
        pin: true,
        pinSpacing: true,
        // Snapping to thirds keeps a product from being left half-swapped when
        // scrolling stops, which is where this pattern usually looks broken.
        snap: {
          snapTo: 1 / (CORE_PRODUCTS.length - 1),
          duration: { min: 0.15, max: 0.4 },
          delay: 0.05,
          ease: 'power2.inOut',
        },
        onUpdate: (self) => {
          const index = Math.min(
            CORE_PRODUCTS.length - 1,
            Math.floor(self.progress * CORE_PRODUCTS.length),
          )
          setActive((current) => (current === index ? current : index))
        },
        invalidateOnRefresh: true,
      })
    }, node)

    return () => context.revert()
  }, [ready, reduced])

  return (
    <div id="product" ref={root} className="relative overflow-hidden px-[var(--gutter)] py-20 lg:h-screen lg:py-0">
      <div className="mx-auto flex h-full max-w-[80rem] flex-col justify-center">
        <div className="relative flex items-start justify-between gap-8 pt-8 lg:pt-0">
          <EditorialHeading
            size="md"
            className="max-w-[16ch]"
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

        <div className="mt-12 grid gap-10 lg:mt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
          {/* Left: the interface. Stacked, with only the active one visible. */}
          <div className="relative aspect-[4/3] w-full lg:aspect-[16/11]">
            {CORE_PRODUCTS.map((product, index) => {
              const Visual = VISUALS[index] ?? VISUALS[0]!
              return (
                <div
                  key={product.key}
                  aria-hidden={active !== index}
                  className={cn(
                    'absolute inset-0 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--ed-ink)_10%,transparent)] bg-white',
                    'transition-[opacity,transform,clip-path] duration-[900ms]',
                    'max-lg:relative max-lg:mb-6 max-lg:opacity-100',
                    active === index
                      ? 'z-10 translate-y-0 scale-100 opacity-100 [clip-path:inset(0_0_0_0_round_1rem)]'
                      : 'z-0 translate-y-6 scale-[0.965] opacity-0 [clip-path:inset(0_0_14%_0_round_1rem)]',
                  )}
                  style={{ transitionTimingFunction: 'var(--ed-ease)' }}
                >
                  <Visual />
                </div>
              )
            })}
          </div>

          {/* Right: the three, with the active one brought forward. */}
          <ol className="space-y-8 lg:space-y-10">
            {CORE_PRODUCTS.map((product, index) => (
              <li
                key={product.key}
                className={cn(
                  'transition-[opacity,transform] duration-[700ms]',
                  active === index
                    ? 'translate-y-0 opacity-100'
                    : 'opacity-100 lg:translate-y-1 lg:opacity-35',
                )}
                style={{ transitionTimingFunction: 'var(--ed-ease)' }}
              >
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
      </div>
    </div>
  )
}
