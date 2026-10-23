import type { Metadata } from 'next'
import { PageIntro, Prose, ProseSection } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: "MyCampusView for preschools",
  description: "Attendance, fees and daily parent communication for early years settings, without the machinery of examinations.",
  alternates: { canonical: '/solutions/preschools' },
}

export default function Page() {
  return (
    <>
      <PageIntro image={{ src: '/images/site/intro-preschool.jpg', alt: 'Illustration of toy blocks, a crayon and a ball' }} eyebrow="Preschools" title="Fewer students. Far more parent contact." lead="A preschool has a hundred children and four hundred conversations a week. The administration that matters is attendance, fees and telling parents what happened today." />

      <ProseSection>
        <Prose title="Turn off what you do not need" image={{ src: '/images/site/r-settings-tablet.jpg', alt: 'Illustration of a settings panel of on and off switches' }}>
          <p>Examinations, report cards and timetables can stay switched off. Modules are enabled per school, so the product a preschool signs into is smaller than the one a senior school signs into.</p>
        </Prose>

        <Prose title="The parts that carry the weight" image={{ src: '/images/site/r-preschool-play.jpg', alt: 'Illustration of a block tower, a ball and a toy duck' }}>
          <p>Daily attendance, fee invoices and receipts, notices to a class or the whole school, and a mailbox that keeps a conversation with a parent on the child’s record rather than on a staff member’s phone.</p>
        </Prose>

        <Prose title="Transport, if you run it" image={{ src: '/images/site/r-bus-stop-parent.jpg', alt: 'Illustration of a bus approaching a stop and a phone alert' }}>
          <p>Small fleets benefit most from live tracking, because a preschool parent asking where the bus is will call rather than wait.</p>
        </Prose>
      </ProseSection>

      <ClosingCta />
    </>
  )
}
