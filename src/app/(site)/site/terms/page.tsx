import type { Metadata } from 'next'
import { PageIntro, Prose, ProseSection } from '@/components/site/page-parts'

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms covering use of the MyCampusView website.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Terms"
        title="mycampusview.com Website Terms"
        lead="These terms cover the mycampusview.com website. Use of the MyCampusView application to manage a campus with many students is governed by the separate agreement a school signs."
      />

      <ProseSection>
        <Prose title="Data and content for your school on one platform">
          <p>
            The descriptions here reflect the product as it stands. Where a capability—such as migrating
            spreadsheets—is still being built we say so on the page rather than in a footnote. Screens
            shown use sample data and are not any real school&rsquo;s student records.
          </p>
        </Prose>

        <Prose title="Enquiries to book a demonstration">
          <p>
            Submitting the form to book a demonstration does not create an agreement or oblige either side to
            anything. It simply asks us to contact you to show how the system handles everything from the
            academic calendar to daily operations.
          </p>
        </Prose>

        <Prose title="Managing staff and examinations">
          <p>
            The MyCampusView name, the wordmark and the contents of this site belong to us. Whether you are
            researching a system for a single student or looking to overhaul how your staff handles
            examinations, you are welcome to quote or link to our site; please do not reproduce it as your own.
          </p>
        </Prose>

        <Prose title="Updates to attendance features">
          <p>
            The site and these terms change as the product does. Even as we add new tools for tracking
            staff attendance and daily attendance, the current version of these terms is always the
            one published here.
          </p>
          <p className="text-[15px] text-[var(--text-subtle)]">Last updated: August 2026.</p>
        </Prose>
      </ProseSection>
    </>
  )
}
