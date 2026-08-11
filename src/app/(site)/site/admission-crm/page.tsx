import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, Prose, ProseSection, Pullquote } from '@/components/site/page-parts'
import { SectionHeader, StatusBadge, TextLink } from '@/components/site/ui'
import { ClosingCta } from '@/components/site/cta'
import { breadcrumbJsonLd } from '@/components/site/seo'
import { MODULE_CATEGORIES } from '@/content/site/modules'

export const metadata: Metadata = {
  title: 'Admission CRM for schools — enquiry to enrolment',
  description:
    'How SchoolOS handles admission enquiries today, what enrolment writes into student records, and exactly which parts of the admission pipeline are still being built.',
  alternates: { canonical: '/admission-crm' },
}

const admissions = MODULE_CATEGORIES.find((category) => category.key === 'admissions')!

/**
 * Admission CRM.
 *
 * The hardest page on the site to write honestly, because the pipeline is the
 * thing a prospective school most wants and the thing least built. The page
 * therefore leads with what an enquiry does today, states the gap in its own
 * section rather than in a footnote, and lets the module table carry the
 * per-feature status.
 */
export default function AdmissionCrmPage() {
  return (
    <>
      {breadcrumbJsonLd([{ name: 'Admission CRM', path: '/admission-crm' }])}

      <PageIntro
        eyebrow="Admission CRM"
        title="Turn every admission enquiry into a record, not a note."
        lead="A school’s admission season runs on memory: a name on a pad, a follow-up somebody meant to make, a family who visited twice and was never called back. SchoolOS puts the enquiry on the system from the first call and turns an admitted child into a student record without retyping anything."
      />

      <ProseSection>
        <Prose title="Where enquiries are lost">
          <p>
            Almost nobody loses an enquiry deliberately. They are lost between people — the call
            that came in while the counsellor was on a school tour, the WhatsApp message answered
            from a personal phone, the visit written in a diary that stayed in a drawer over the
            weekend.
          </p>
          <p>
            The cost is invisible, which is why it persists. A school with three hundred enquiries a
            season and a two-percentage-point leak has lost six admissions, and no report will ever
            show it.
          </p>
        </Prose>

        <Prose title="What happens today">
          <p>
            An enquiry is recorded against the family, with the child, the class being asked about
            and where the enquiry came from. New enquiries appear on the administrator&rsquo;s
            dashboard, so they are visible to somebody other than the person who took the call.
          </p>
          <p>
            When a child joins, the student record, the enrolment for the year and the guardian
            accounts are written in a single step — and the fee structure for that class applies
            from that moment, without the accounts office being told separately.
          </p>
        </Prose>

        <Prose title="What is not built yet">
          <p>
            Stage-by-stage pipeline tracking, follow-up reminders with an owner and a date,
            counsellor assignment, online application forms with document collection, and conversion
            reporting by source are <strong>in build</strong>. They are the next release, and they
            are not on the system today.
          </p>
          <p>
            We say this here, on the page that sells it, because you would find out on the first
            call. If admissions is the reason you are shopping, that is worth knowing before you
            spend forty minutes with us.
          </p>
        </Prose>
      </ProseSection>

      <Section tone="page">
        <Container wide>
          <SectionHeader
            split
            eyebrow="Status, module by module"
            title="Every part of admissions, labelled."
            lead="The same catalogue the rest of the site reads from. Nothing here is described as available unless the screen exists."
            action={<TextLink href="/modules">The full module catalogue</TextLink>}
          />

          <ul className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {admissions.modules.map((module) => (
              <li key={module.name} className="border-t border-[var(--rule-strong)] pt-4">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h3 className="text-[16px] font-semibold text-[var(--text)]">{module.name}</h3>
                  <StatusBadge status={module.status} />
                </div>
                <p className="muted mt-2 text-[15px] leading-[1.55]">{module.blurb}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section>
        <Container>
          <Pullquote>
            An admission enquiry is the first thing a school promises to remember. It should not be
            the least well recorded.
          </Pullquote>
        </Container>
      </Section>

      <ClosingCta
        title="Ask us what admissions looks like in the next release."
        body="We will show you the enquiry capture and the enrolment that work today, and the pipeline as it stands in development — clearly labelled as such."
      />
    </>
  )
}
