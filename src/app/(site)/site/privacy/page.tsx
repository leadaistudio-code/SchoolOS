import type { Metadata } from 'next'
import { PageIntro, Prose, ProseSection } from '@/components/site/page-parts'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What MyCampusView collects from this website and how school data is handled.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <>
      <PageIntro image={{ src: '/images/site/intro-privacy.jpg', alt: 'Illustration of a folder, padlock and shield' }}
        eyebrow="Privacy"
        title="Privacy"
        lead="This page covers the public website. Data held inside a school's MyCampusView system belongs to that school and is governed by the agreement it signs."
      />

      <ProseSection>
        <Prose title="What this website collects" image={{ src: '/images/site/r-audit-log.jpg', alt: 'Illustration of an activity timeline under a magnifying glass' }}>
          <p>
            If you complete the demo form we store what you enter — your name, email, phone,
            school, and anything you write in the message — together with the time, your network
            address and the page you came from. It is used to contact you about MyCampusView and for
            nothing else.
          </p>
          <p>
            We do not add you to a mailing list, and we do not sell or share the information.
          </p>
        </Prose>

        <Prose title="School data" image={{ src: '/images/site/r-separate-boxes.jpg', alt: 'Illustration of three locked boxes kept apart' }}>
          <p>
            Data your school enters into MyCampusView — student records, attendance, fees, results —
            belongs to your school. We process it to provide the service. We do not use it to train
            anything, and we do not disclose it to anyone else except where a school instructs us
            to or the law requires it.
          </p>
        </Prose>

        <Prose title="Retention and removal" image={{ src: '/images/site/r-archive-boxes.jpg', alt: 'Illustration of an archive box, an hourglass and a bin' }}>
          <p>
            Enquiry records are kept while they are commercially relevant and removed on request.
            School data is retained for the life of the agreement and exported or deleted at its
            end, according to the school&rsquo;s instruction.
          </p>
        </Prose>

        <Prose title="Getting in touch" image={{ src: '/images/site/r-support.jpg', alt: 'Illustration of a headset between chat bubbles' }}>
          <p>
            To ask what we hold about you, or to have it removed, use the contact page. This
            document is updated as the service changes, and the date of the last change is shown
            below.
          </p>
          <p className="text-[15px] text-[var(--text-subtle)]">Last updated: August 2026.</p>
        </Prose>
      </ProseSection>
    </>
  )
}
