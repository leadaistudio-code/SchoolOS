import * as React from 'react'
import Link from 'next/link'
import { Container, Section } from './container'

/**
 * The closing ask.
 *
 * Not a gradient rectangle with a button in the middle. The isolation point
 * sits directly above it because it is the last objection a director raises,
 * and answering it in three factual sentences is worth more than a badge.
 */
export function ClosingCta({
  eyebrow = 'Next step',
  title = 'See how SchoolOS would work for your school.',
  body = 'Tell us how your school runs today — what is on paper, what is in spreadsheets, what your current software does badly. The demonstration follows that, not a script.',
}: {
  eyebrow?: string
  title?: string
  body?: string
}) {
  return (
    <Section tone="paper">
      <Container>
        <div className="rule pt-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h2 className="display mt-3 text-[clamp(2rem,4.4vw,3rem)]">{title}</h2>
              <p className="muted mt-5 max-w-xl text-[18px] leading-[1.55]">{body}</p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/book-demo"
                  className="rounded-lg bg-[var(--ink)] px-5 py-3 text-[16px] font-medium text-white transition-colors hover:bg-[var(--navy)]"
                >
                  Book a demo
                </Link>
                <Link
                  href="/contact"
                  className="rounded-lg border border-[var(--rule-strong)] px-5 py-3 text-[16px] font-medium text-[var(--text)] transition-colors hover:border-[var(--ink)]"
                >
                  Talk to our team
                </Link>
              </div>
            </div>

            <div className="border-t border-[var(--rule)] pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
              <h3 className="text-[16px] font-semibold text-[var(--text)]">
                What we will need from you
              </h3>
              <ul className="mt-4 space-y-3">
                {[
                  'Roughly how many students and staff',
                  'What you use today for fees and attendance',
                  'Whether you run one campus or several',
                ].map((item) => (
                  <li key={item} className="text-[15px] text-[var(--text-muted)]">
                    {item}
                  </li>
                ))}
              </ul>
              <p className="subtle mt-5 text-[14px]">
                Thirty to forty minutes is usually enough.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}

/**
 * Isolation, stated plainly.
 *
 * Only claims that are true of the code: separation enforced in the data
 * layer, an audit trail, per-role access. No certification badges, because
 * there are no certifications.
 */
export function TrustNote() {
  return (
    <Section tone="paper">
      <Container>
        <div className="grid gap-10 border-t border-[var(--rule)] pt-14 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-16">
          <div>
            <p className="eyebrow">Separation</p>
            <h2 className="mt-3 text-[26px] font-semibold leading-tight text-[var(--text)]">
              Two schools on one system, with no way to reach each other.
            </h2>
          </div>
          <div className="max-w-2xl space-y-4 text-[17px] leading-[1.6] text-[var(--text-muted)]">
            <p>
              Every query carries the school it belongs to. That is enforced in the database layer
              rather than remembered by each screen, and it is covered by tests that fail the
              build if a query could ever cross the boundary.
            </p>
            <p>
              Inside a school, what someone sees follows their role. A parent reaches their own
              children and nothing else. A teacher marks their own classes. Sensitive actions —
              fee collection, result publication, permission changes — are written to an audit
              trail with the person and the time.
            </p>
            <p className="text-[15px] text-[var(--text-subtle)]">
              We hold no security certifications and do not claim any. What is described here is
              how the software is built, and we are happy to walk your IT team through it.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  )
}
