import * as React from 'react'
import { Check } from 'lucide-react'
import { Container, Section } from '../container'
import { SectionHeader, TextLink } from '../ui'
import { CORE_PRODUCTS } from '@/content/site/company'

/**
 * SIS, CRM, ERP.
 *
 * Three products, and the obvious treatment is three equal cards in a row —
 * which is also the treatment that makes them look interchangeable and gives
 * each about forty words. These are full-width panels instead: alternating
 * sides, a real capability list, and what is *not* built named under a heading
 * that says so.
 *
 * The abbreviation is set large and quiet in the corner because it is how a
 * director will refer to it on a call, not because it needs decorating.
 */
export function CoreProducts() {
  return (
    <Section tone="cream">
      <Container wide>
        <SectionHeader
          split
          eyebrow="Three products, one system"
          title="SIS, CRM and ERP — sold together because they are built together."
          lead="Most schools buy these separately and then pay, in staff time, for the gap between them. Inside SchoolOS they are three views of the same data rather than three databases with an import between them."
        />

        <div className="mt-14 space-y-6">
          {CORE_PRODUCTS.map((product, index) => (
            <article
              key={product.key}
              className="grid gap-8 rounded-xl border border-[var(--rule)] bg-white p-6 sm:p-9 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:gap-14 panel-hover"
            >
              <div className={index % 2 === 1 ? 'lg:order-2' : undefined}>
                <div className="flex items-baseline gap-3">
                  <span className="display text-[26px] tracking-[-0.03em] text-[var(--blue)]">
                    {product.abbr}
                  </span>
                  <span className="text-[13px] uppercase tracking-[0.09em] text-[var(--text-subtle)]">
                    {index === 0 ? 'Before they join' : index === 1 ? 'While they are here' : 'Around them'}
                  </span>
                </div>
                <h3 className="display mt-3 text-[clamp(1.5rem,2.4vw,1.9rem)]">{product.name}</h3>
                <p className="muted mt-4 text-[17px] leading-[1.6]">{product.lead}</p>
                <TextLink href={product.href} className="mt-6">
                  Read about {product.abbr === 'SIS' ? 'student records' : product.abbr === 'CRM' ? 'admissions' : 'school operations'}
                </TextLink>
              </div>

              <div className={index % 2 === 1 ? 'lg:order-1' : undefined}>
                <p className="eyebrow">Working today</p>
                <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
                  {product.capabilities.map((capability) => (
                    <li key={capability} className="flex items-start gap-2.5">
                      <Check
                        className="mt-1 size-4 shrink-0 text-[var(--blue)]"
                        aria-hidden
                        strokeWidth={2.5}
                      />
                      <span className="text-[15px] leading-[1.5] text-[var(--text-muted)]">
                        {capability}
                      </span>
                    </li>
                  ))}
                </ul>

                {product.next.length ? (
                  <div className="mt-6 border-t border-[var(--rule)] pt-5">
                    <p className="eyebrow">Next, and not available yet</p>
                    <p className="muted mt-2.5 text-[15px] leading-[1.6]">
                      {product.next.join(' · ')}
                    </p>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  )
}
