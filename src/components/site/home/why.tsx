import * as React from 'react'
import { Container, Section } from '../container'
import { SectionHeader } from '../ui'
import { DIFFERENTIATORS } from '@/content/site/company'

/**
 * Why MyCampusView.
 *
 * Eight points, each a property of the build rather than an adjective, set as a
 * numbered editorial list. Deliberately no icons: a lucide glyph beside
 * "separation enforced in the data layer" adds nothing a reader can use, and a
 * grid of eight decorative icons is one of the clearest signs of a page
 * assembled rather than written.
 */
export function Why() {
  return (
    <Section tone="page">
      <Container wide>
        <SectionHeader
          split
          eyebrow="Why MyCampusView"
          title="What is actually different about it."
          lead="Not a list of adjectives. Each of these is a decision in the software that you can ask us to demonstrate, or that your IT team can check for themselves."
        />

        <ol className="mt-12 grid gap-x-14 gap-y-9 md:grid-cols-2">
          {DIFFERENTIATORS.map((item, index) => (
            <li
              key={item.title}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 border-t border-[var(--rule-strong)] pt-5"
            >
              <span className="text-[13px] tabular-nums text-[var(--text-subtle)]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-[17px] font-semibold leading-[1.35] text-[var(--text)]">
                  {item.title}
                </h3>
                <p className="muted mt-2 text-[15px] leading-[1.6]">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  )
}
