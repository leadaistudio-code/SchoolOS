import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, Prose, ProseSection, CapabilityList } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'Implementation and support',
  description:
    'Setup, data migration, training and ongoing support — the work that decides whether school software is actually used.',
  alternates: { canonical: '/services' },
}

export default function ServicesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Services"
        title="Software is only useful when your school can actually use it."
        lead="Most failed school software was not bad software. It was installed, never populated properly, and abandoned by the third month."
      />

      <ProseSection>
        <Prose title="Getting set up">
          <p>
            Your academic session, classes, sections and subjects are configured first, because
            everything else hangs off them. Then roles: who marks registers, who collects fees, who
            may publish results. Getting this right at the start prevents most of the confusion
            that follows.
          </p>
        </Prose>

        <Prose title="Bringing your data across">
          <p>
            Students, guardians, staff and current fee balances are the four that matter. We take
            what you have — usually spreadsheets exported from whatever you run now — and load it,
            reporting every row that does not fit rather than quietly dropping it.
          </p>
          <p>
            Historical data is a decision, not a default. Three years of attendance may be worth
            carrying; ten years of receipts usually is not.
          </p>
        </Prose>

        <Prose title="Training the people who will use it">
          <p>
            Separate sessions for the front office, the finance team, teachers and the transport
            desk. A teacher needs fifteen minutes on registers and homework, not an hour on the
            whole product.
          </p>
        </Prose>

        <Prose title="Afterwards">
          <p>
            Configuration changes as the school year turns — new sessions, new fee structures, new
            staff. Support covers that as well as the occasional thing going wrong.
          </p>
        </Prose>
      </ProseSection>

      <Section tone="page">
        <Container wide>
          <CapabilityList
            groups={[
              {
                heading: 'Implementation',
                items: ['Academic structure', 'Classes and sections', 'Fee heads and structures', 'Roles and permissions', 'School branding'],
              },
              {
                heading: 'Migration',
                items: ['Student and guardian records', 'Staff records', 'Opening fee balances', 'Historical attendance', 'Documents'],
              },
              {
                heading: 'Training',
                items: ['Administrators', 'Front office', 'Finance team', 'Teachers', 'Transport desk'],
              },
              {
                heading: 'Configuration',
                items: ['Grading scales', 'Report card format', 'Notice audiences', 'Transport routes', 'Your own mail server'],
              },
              {
                heading: 'Support',
                items: ['Product questions', 'Session rollover', 'New fee structures', 'Adding staff and roles'],
              },
              {
                heading: 'On request',
                items: ['Custom domain', 'Payment gateway', 'SMS and WhatsApp providers', 'Data export'],
              },
            ]}
          />
          <p className="subtle mt-10 max-w-2xl text-[15px]">
            Integrations are configured per school against providers you hold accounts with. We do
            not resell messaging or payment services.
          </p>
        </Container>
      </Section>

      <ClosingCta />
    </>
  )
}
