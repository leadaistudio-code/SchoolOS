import * as React from 'react'
import { Container, Section } from '../container'
import { SampleMark, SectionHeader, TextLink } from '../ui'
import { CASE_STUDIES, PROOF_FLAGS, TESTIMONIALS } from '@/content/site/proof'

/**
 * Customer stories and testimonials.
 *
 * Both render only when their flag in `content/site/proof.ts` is on, and both
 * mark unapproved content as a sample layout in the markup itself. That is the
 * whole design constraint: a placeholder that is not visibly a placeholder gets
 * published, and a fabricated testimonial from a named principal is the one
 * mistake on a website like this that cannot be walked back.
 *
 * The institutions are described, never named, until a school has agreed in
 * writing to be.
 */

export function CaseStudies() {
  if (!PROOF_FLAGS.caseStudies || CASE_STUDIES.length === 0) return null

  return (
    <Section>
      <Container wide>
        <SectionHeader
          split
          eyebrow="Customer stories"
          title="What changes in the first term."
          lead="Written as problem, what we did, and what it changed — the three things a director actually wants from a case study. Schools are described rather than named until they have agreed to be."
          action={<TextLink href="/customers">All customer stories</TextLink>}
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-3" data-reveal data-reveal-stagger>
          {CASE_STUDIES.map((story) => (
            <article
              key={story.school + story.location}
              className="flex flex-col rounded-xl border border-[var(--rule)] bg-white p-6 panel-hover"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[17px] font-semibold text-[var(--text)]">{story.school}</h3>
                {story.sample ? <SampleMark /> : null}
              </div>
              <p className="subtle mt-1 text-[14px]">
                {story.location} · {story.size}
              </p>

              <dl className="mt-5 space-y-4 border-t border-[var(--rule)] pt-5">
                {[
                  ['The problem', story.problem],
                  ['What we did', story.approach],
                  ['What changed', story.outcome],
                ].map(([term, detail]) => (
                  <div key={term}>
                    <dt className="eyebrow">{term}</dt>
                    <dd className="muted mt-1.5 text-[15px] leading-[1.6]">{detail}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>

        {CASE_STUDIES.some((story) => story.sample) ? (
          <p className="subtle mt-8 max-w-3xl text-[14px] leading-[1.6]">
            Marked stories are layout, not history: the structure a written-up implementation will
            take once a school has approved theirs. We would rather show you an obvious template
            than an invented customer.
          </p>
        ) : null}
      </Container>
    </Section>
  )
}

export function Testimonials() {
  if (!PROOF_FLAGS.testimonials || TESTIMONIALS.length === 0) return null

  return (
    <Section tone="cream" space="snug">
      <Container wide>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className="eyebrow">In their words</p>
            <h2 className="mt-3 text-[22px] font-semibold leading-[1.3] text-[var(--text)]">
              What we expect to hear, and will replace with what we do.
            </h2>
            <p className="muted mt-3 text-[15px] leading-[1.6]">
              No carousel and no stock portraits. When a school approves a quotation it goes here
              with their name and their role, and this note disappears.
            </p>
          </div>

          {/* Three quotations set as editorial pull quotes, not cards with
              rounded avatars and five gold stars. */}
          <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <figure key={testimonial.quote} className="border-t border-[var(--rule-strong)] pt-5">
                <blockquote className="display text-[19px] leading-[1.4] text-[var(--text)]">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-[14px]">
                  <span className="block font-medium text-[var(--text)]">
                    {testimonial.sample ? 'Awaiting approval' : testimonial.name}
                  </span>
                  <span className="subtle block">
                    {testimonial.role}
                    {testimonial.sample ? '' : `, ${testimonial.school}`}
                  </span>
                  {testimonial.sample ? <SampleMark className="mt-2" /> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  )
}
