import * as React from 'react'
import { Container, Section } from '../container'
import { METRICS } from '@/content/site/proof'

/**
 * The credibility band.
 *
 * Every school ERP site in this market puts client counts here — 2,000 schools,
 * 96% retention, 1.5 million students. We do not have those numbers, so this
 * section does the same job with facts about the product that a visitor can
 * verify on a call instead. It is a weaker claim honestly made, which is worth
 * more to a director than a strong one they cannot check.
 *
 * The figures do not animate.
 *
 * An earlier version counted them up on scroll, which was wrong twice over.
 * Mechanically it was broken: the parse of each value was recreated on every
 * render and fed back into the effect's dependencies, so each animation frame
 * restarted the animation and the numbers sat flickering near zero. But it was
 * also the wrong idea — three of these four values are 1, 11 and 100%, and a
 * "1" counting up from "0" tells a reader nothing while making a stable page
 * feel unstable. Removing it also makes this a server component again, so the
 * section ships no JavaScript.
 */
export function Metrics() {
  return (
    <Section tone="page" space="snug">
      <Container wide>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className="eyebrow">The shape of the product</p>
            <h2 className="mt-3 text-[22px] font-semibold leading-[1.3] text-[var(--text)]">
              Numbers about the software, not about our sales.
            </h2>
            <p className="muted mt-3 text-[15px] leading-[1.6]">
              We are a young product and will not pretend otherwise. What we can tell you is exactly
              what is built, and you can check every figure here on a call.
            </p>
          </div>

          <dl className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((metric) => (
              <div key={metric.label} className="border-t border-[var(--rule-strong)] pt-5">
                <dd className="display text-[clamp(2.1rem,4vw,2.6rem)] tabular-nums text-[var(--text)]">
                  {metric.value}
                </dd>
                <dt className="mt-2 text-[15px] font-semibold text-[var(--text)]">
                  {metric.label}
                </dt>
                <p className="muted mt-2 text-[14px] leading-[1.55]">{metric.note}</p>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </Section>
  )
}
