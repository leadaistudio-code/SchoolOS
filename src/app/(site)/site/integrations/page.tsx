import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, Prose, ProseSection } from '@/components/site/page-parts'
import { SectionHeader, StatusBadge } from '@/components/site/ui'
import { ClosingCta } from '@/components/site/cta'
import { breadcrumbJsonLd, faqJsonLd } from '@/components/site/seo'
import {
  INTEGRATION_GROUPS,
  INTEGRATION_STATUS_NOTE,
} from '@/content/site/integrations'

export const metadata: Metadata = {
  title: 'Integrations — WhatsApp, SMS, email, payments and vehicle tracking',
  description:
    'How MyCampusView connects to messaging, payment gateways, vehicle tracking and your own domain — with each capability marked live, connected at setup, or planned.',
  alternates: { canonical: '/integrations' },
}

const FAQ = [
  {
    question: 'Does MyCampusView send WhatsApp and SMS messages to parents?',
    answer:
      'The delivery pipeline, templates and per-school metering are built. The vendor account is your school’s own, connected during implementation, so messages are sent from your sender ID and billed to you rather than resold by us.',
  },
  {
    question: 'Which payment gateway does MyCampusView support?',
    answer:
      'Online fee payment is built against a provider interface: orders are created server-side and callbacks are signature-verified. Your gateway account is connected at setup, and money settles directly into the school’s bank account.',
  },
  {
    question: 'Can MyCampusView run on our own domain?',
    answer:
      'Yes. The application runs on a domain your school owns, with certificates issued and renewed automatically, and the school’s name, logo and colours throughout.',
  },
  {
    question: 'Does MyCampusView integrate with Tally or biometric devices?',
    answer:
      'Not today. Both are on the roadmap and are marked as planned on this page rather than presented as available.',
  },
]

export default function IntegrationsPage() {
  return (
    <>
      {breadcrumbJsonLd([{ name: 'Integrations', path: '/integrations' }])}
      {faqJsonLd(FAQ)}

      <PageIntro
        eyebrow="Integrations"
        title="Connected to what your school already uses — through your own accounts."
        lead="MyCampusView reaches the outside world through provider interfaces, so a messaging vendor or a payment gateway can be changed by configuration rather than by rewriting a module. It also means the account is yours: your sender ID, your gateway, your bank."
      >
        <dl className="grid max-w-3xl gap-5 sm:grid-cols-3">
          {(['available', 'ready', 'planned'] as const).map((status) => (
            <div key={status} className="border-t border-[var(--rule-strong)] pt-4">
              <dt>
                <StatusBadge status={status} />
              </dt>
              <dd className="muted mt-2.5 text-[14px] leading-[1.55]">
                {INTEGRATION_STATUS_NOTE[status]}
              </dd>
            </div>
          ))}
        </dl>
      </PageIntro>

      {INTEGRATION_GROUPS.map((group, index) => (
        <Section key={group.heading} tone={index % 2 === 1 ? 'cream' : 'paper'} space="snug">
          <Container wide>
            <SectionHeader split title={group.heading} lead={group.lead} />

            <ul className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <li key={item.name} className="border-t border-[var(--rule-strong)] pt-4">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <h3 className="text-[16px] font-semibold text-[var(--text)]">{item.name}</h3>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="muted mt-2 text-[15px] leading-[1.55]">{item.blurb}</p>
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      ))}

      <ProseSection>
        <Prose title="Why the account is yours">
          <p>
            Some school software resells messaging: the school buys a bundle of SMS credits from the
            vendor, at the vendor&rsquo;s margin, and the sender ID belongs to the vendor too. When
            the contract ends, so does the number parents have learned to trust.
          </p>
          <p>
            MyCampusView connects to your own gateway and your own WhatsApp Business account instead.
            You pay the vendor directly, the sender is your school, and nothing about your parents&rsquo;
            experience depends on our commercial relationship with a telecom provider.
          </p>
        </Prose>

        <Prose title="Building against an interface">
          <p>
            Email, SMS, WhatsApp, payments, storage and maps each sit behind a contract in the code
            that business logic depends on instead of depending on a vendor. Switching provider is a
            configuration change, and a school that already has an SMS contract keeps it.
          </p>
          <p>
            The same design is why this page can be precise about status. An interface existing is
            not the same as a vendor being connected, and we distinguish the two rather than
            counting both as an integration.
          </p>
        </Prose>

        <Prose title="Questions we are asked">
          <dl className="space-y-6">
            {FAQ.map((item) => (
              <div key={item.question}>
                <dt className="text-[16px] font-semibold text-[var(--text)]">{item.question}</dt>
                <dd className="mt-2">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </Prose>
      </ProseSection>

      <ClosingCta
        title="Tell us what you already pay for."
        body="If your school has an SMS contract, a gateway or a tracking vendor, bring it to the call. In most cases we connect what you have rather than replacing it."
      />
    </>
  )
}
