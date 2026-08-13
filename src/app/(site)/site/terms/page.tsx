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
        title="Website terms"
        lead="These terms cover this website. Use of the MyCampusView application is governed by the separate agreement a school signs."
      />

      <ProseSection>
        <Prose title="What is on this site">
          <p>
            The descriptions here reflect the product as it stands. Where a capability is still
            being built we say so on the page rather than in a footnote. Screens shown use sample
            data and are not any school&rsquo;s records.
          </p>
        </Prose>

        <Prose title="Enquiries">
          <p>
            Submitting the demo form does not create an agreement or oblige either side to
            anything. It asks us to contact you.
          </p>
        </Prose>

        <Prose title="Trade marks and content">
          <p>
            The MyCampusView name, the wordmark and the contents of this site belong to us. You are
            welcome to quote or link to it; please do not reproduce it as your own.
          </p>
        </Prose>

        <Prose title="Changes">
          <p>
            The site and these terms change as the product does. The current version is always the
            one published here.
          </p>
          <p className="text-[15px] text-[var(--text-subtle)]">Last updated: August 2026.</p>
        </Prose>
      </ProseSection>
    </>
  )
}
