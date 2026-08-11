import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, Prose, ProseSection } from '@/components/site/page-parts'
import { SampleMark, SectionHeader } from '@/components/site/ui'
import { ClosingCta } from '@/components/site/cta'
import { breadcrumbJsonLd } from '@/components/site/seo'
import { CASE_STUDIES, CUSTOMER_LOGOS, PROOF_FLAGS } from '@/content/site/proof'
import { JOURNEY } from '@/content/site/company'

export const metadata: Metadata = {
  title: 'Customer stories',
  description:
    'How schools move onto SchoolOS: the problem, the migration, and what changes in the first term. Written up as implementations complete.',
  alternates: { canonical: '/customers' },
}

/**
 * Customer stories.
 *
 * A young product's customers page is usually the most dishonest page on its
 * website — a logo wall of pilots, invented metrics, quotations nobody said. So
 * this one is explicit about where we are, and puts the structure a real story
 * will take in front of the reader instead of a fabricated one.
 */
export default function CustomersPage() {
  return (
    <>
      {breadcrumbJsonLd([{ name: 'Customer stories', path: '/customers' }])}

      <PageIntro
        eyebrow="Customers"
        title="What changes in a school’s first term on SchoolOS."
        lead="Every story here follows the same three questions: what was the problem, what did we actually do, and what changed afterwards. Schools are named only once they have agreed in writing to be."
      />

      {CUSTOMER_LOGOS.length > 0 && PROOF_FLAGS.customerLogos ? (
        <Section space="snug" tone="page">
          <Container wide>
            <p className="eyebrow">Schools using SchoolOS</p>
            <ul className="mt-6 flex flex-wrap items-center gap-x-12 gap-y-8">
              {CUSTOMER_LOGOS.map((logo) => (
                <li key={logo.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo.src} alt={logo.name} className="h-8 w-auto opacity-80" />
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      ) : (
        <Section space="snug" tone="page">
          <Container wide>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
              <h2 className="text-[22px] font-semibold leading-[1.3] text-[var(--text)]">
                Why there is no logo wall here
              </h2>
              <div className="max-w-[var(--measure)] space-y-4 text-[16px] leading-[1.65] text-[var(--text-muted)]">
                <p>
                  Naming a school on a website is that school&rsquo;s decision, not ours, and a wall
                  of marks collected without asking is a poor way to demonstrate that we handle
                  other people&rsquo;s data carefully.
                </p>
                <p>
                  When schools give us written permission, their marks will appear here. Until then,
                  we will introduce you to a reference school on a call instead — which is worth more
                  than a logo anyway.
                </p>
              </div>
            </div>
          </Container>
        </Section>
      )}

      {PROOF_FLAGS.caseStudies ? (
        <Section>
          <Container wide>
            <SectionHeader
              split
              eyebrow="Stories"
              title="Implementations, written up."
              lead="Marked entries are layout rather than history — the shape a story takes, with the numbers left for the school to supply. They will be replaced, not embellished."
            />

            <div className="mt-12 space-y-6">
              {CASE_STUDIES.map((story) => (
                <article
                  key={story.school + story.location}
                  className="grid gap-8 rounded-xl border border-[var(--rule)] bg-white p-6 sm:p-9 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-14"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[19px] font-semibold text-[var(--text)]">
                        {story.school}
                      </h3>
                      {story.sample ? <SampleMark /> : null}
                    </div>
                    <dl className="mt-4 space-y-2 text-[15px]">
                      <div className="flex gap-2">
                        <dt className="subtle w-20 shrink-0">Location</dt>
                        <dd className="text-[var(--text-muted)]">{story.location}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="subtle w-20 shrink-0">Size</dt>
                        <dd className="text-[var(--text-muted)]">{story.size}</dd>
                      </div>
                    </dl>
                  </div>

                  <dl className="grid gap-6 sm:grid-cols-3">
                    {[
                      ['The problem', story.problem],
                      ['What we did', story.approach],
                      ['What changed', story.outcome],
                    ].map(([term, detail]) => (
                      <div key={term} className="border-t border-[var(--rule)] pt-4">
                        <dt className="eyebrow">{term}</dt>
                        <dd className="muted mt-2 text-[15px] leading-[1.6]">{detail}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </Container>
        </Section>
      ) : null}

      <Section tone="cream">
        <Container wide>
          <SectionHeader
            split
            eyebrow="What a move looks like"
            title="The same sequence for every school."
            lead="Whatever the story, the work is the same six steps. This is what a school signs up to when it moves."
          />
          <ol className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {JOURNEY.map((stage) => (
              <li key={stage.step} className="border-t border-[var(--rule-strong)] pt-4">
                <p className="eyebrow">{stage.when}</p>
                <h3 className="mt-1.5 text-[17px] font-semibold text-[var(--text)]">
                  {stage.title}
                </h3>
                <p className="muted mt-2 text-[15px] leading-[1.6]">{stage.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <ProseSection>
        <Prose title="Would you speak to a school for us?">
          <p>
            If you are already running SchoolOS and the first term went well, a written-up story
            helps the next school more than any page we could write ourselves. We will draft it, you
            approve every word and every number, and you can withdraw it at any point.
          </p>
          <p>
            We will not publish a figure you have not checked, and we will not name your school
            without your written agreement.
          </p>
        </Prose>
      </ProseSection>

      <ClosingCta
        title="Speak to a school that has already moved."
        body="Ask us on the call and, where a school has agreed to it, we will introduce you directly rather than showing you a quotation."
      />
    </>
  )
}
