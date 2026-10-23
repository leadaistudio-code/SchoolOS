import type { Metadata } from 'next'
import { PageIntro, Prose, ProseSection } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: "MyCampusView for private schools",
  description: "Fee collection, attendance, examinations and parent communication for K-12 private schools, on one system.",
  alternates: { canonical: '/solutions/private-schools' },
}

export default function Page() {
  return (
    <>
      <PageIntro image={{ src: '/images/site/intro-private.jpg', alt: 'Illustration of three separate tools merging into one app' }} eyebrow="Private schools" title="Replacing three tools and a spreadsheet." lead="Most private schools we speak to run fees in one package, attendance in another, and communication through personal WhatsApp. The records disagree, and reconciling them is somebody’s week." />

      <ProseSection>
        <Prose title="Where the time goes" image={{ src: '/images/site/r-paper-registers.jpg', alt: 'Illustration of a messy pile of paper registers' }}>
          <p>Fee follow-up is the largest recurring cost in a school office, and most of it is spent working out who actually owes what. When invoices are generated from the class a child is enrolled in, that question stops being research.</p>
          <p>The second cost is attendance reaching the office late. A register marked on a phone in the classroom is in the system before the second period.</p>
        </Prose>

        <Prose title="What changes for the principal" image={{ src: '/images/site/r-principal.jpg', alt: 'Illustration of a monitor showing a gauge, a trend line and KPI tiles' }}>
          <p>The morning figure — present, absent, unmarked registers, collected, outstanding — is available without asking three people for it.</p>
          <p>Examination results are computed from marks already entered, so the fortnight of assembling report cards becomes an afternoon of checking them.</p>
        </Prose>

        <Prose title="What changes for parents" image={{ src: '/images/site/r-upi-phone.jpg', alt: 'Illustration of a phone with a payment QR code and a tick' }}>
          <p>They stop calling the office for attendance, homework and fee balances, because they can see all three.</p>
        </Prose>
      </ProseSection>

      <ClosingCta />
    </>
  )
}
