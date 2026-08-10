import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, Prose, ProseSection, Pullquote } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Why SchoolOS exists, what we believe school software should do, and how we build it.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="About"
        title="Schools deserve better systems than the ones they have."
        lead="Most schools run something critical on a spreadsheet. Fee registers, admission enquiries, transport lists, sometimes attendance. It works until the person who maintains it is on leave."
      />

      <ProseSection>
        <Prose title="Why this exists">
          <p>
            The software schools are sold is usually a set of modules that were built separately
            and joined afterwards. Each holds its own copy of the student list, and keeping them
            in agreement becomes a job somebody does every week.
          </p>
          <p>
            We thought the sensible thing was to start from the record rather than the modules: one
            student, one enrolment, one set of guardians, and every part of the product reading
            from it.
          </p>
        </Prose>

        <Prose title="What we believe about school software">
          <p>
            <strong className="font-semibold text-[var(--text)]">It should remove work, not move it.</strong>{' '}
            If a system needs someone to keep it updated, it has added a job rather than replaced
            one.
          </p>
          <p>
            <strong className="font-semibold text-[var(--text)]">A school is not an office.</strong>{' '}
            Registers are marked while thirty children wait. Fees are collected at a counter with a
            queue. Screens have to work at that speed.
          </p>
          <p>
            <strong className="font-semibold text-[var(--text)]">Separation is not a setting.</strong>{' '}
            One school must never be able to reach another school&rsquo;s data, and a parent must
            never reach another family&rsquo;s. That belongs in the foundations, not in a checkbox.
          </p>
          <p>
            <strong className="font-semibold text-[var(--text)]">Say what it does not do.</strong>{' '}
            Our own feature page lists what is still being built. A school that finds out during
            implementation was told too late.
          </p>
        </Prose>

        <Prose title="How we build">
          <p>
            The product is written as one application over one database, with the tenant boundary
            enforced where data is read rather than remembered by each screen. Sensitive actions
            are written to an audit trail. Tests cover the boundaries that would be expensive to
            get wrong.
          </p>
          <p>
            We would rather ship a smaller product that is correct than a longer feature list that
            is approximately true.
          </p>
        </Prose>

        <Prose title="Who we build for">
          <p>
            Private schools, international schools, preschools and multi-campus groups — the
            institutions large enough that spreadsheets have started to hurt, and small enough that
            enterprise software would be absurd.
          </p>
        </Prose>
      </ProseSection>

      <Section tone="page">
        <Container>
          <Pullquote>
            School technology should reduce administration, not create a new kind of it.
          </Pullquote>
        </Container>
      </Section>

      <ClosingCta />
    </>
  )
}
