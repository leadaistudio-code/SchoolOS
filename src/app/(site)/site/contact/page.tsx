import type { Metadata } from 'next'
import Link from 'next/link'
import { Container, Section } from '@/components/site/container'
import { PageIntro } from '@/components/site/page-parts'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'How to reach the SchoolOS team about sales, support or partnerships.',
  alternates: { canonical: '/contact' },
}

/**
 * Contact.
 *
 * Deliberately sparse. Inventing a phone number or a street address on a
 * software company's contact page is the fastest way to lose a school that
 * checks. Real details go in as they exist.
 */
export default function ContactPage() {
  return (
    <>
      <PageIntro
        eyebrow="Contact"
        title="Talk to someone who knows the product."
        lead="Enquiries reach the people who build and run SchoolOS, not a call centre."
      />

      <Section>
        <Container>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                heading: 'Sales and demonstrations',
                body: 'Questions about whether SchoolOS fits your school, and arranging a demonstration.',
                action: { label: 'Book a demo', href: '/book-demo' },
              },
              {
                heading: 'Existing schools',
                body: 'If your school already uses SchoolOS, your administrator has a direct line to support.',
                action: null,
              },
              {
                heading: 'Partnerships',
                body: 'Resellers, implementation partners and integrations. Tell us what you have in mind.',
                action: { label: 'Get in touch', href: '/book-demo' },
              },
            ].map((block) => (
              <div key={block.heading} className="border-t border-[var(--rule-strong)] pt-5">
                <h2 className="text-[17px] font-semibold text-[var(--text)]">{block.heading}</h2>
                <p className="muted mt-2 text-[15px] leading-[1.6]">{block.body}</p>
                {block.action ? (
                  <Link
                    href={block.action.href}
                    className="mt-4 inline-block text-[15px] font-medium text-[var(--indigo)]"
                  >
                    {block.action.label}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>

          <p className="subtle mt-12 max-w-2xl text-[15px]">
            Email and telephone details are published here once they are set up. Until then the
            demo form reaches us directly and is read by a person.
          </p>
        </Container>
      </Section>
    </>
  )
}
