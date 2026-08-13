import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, Prose, ProseSection, Pullquote, LinkCard } from '@/components/site/page-parts'
import { DashboardRender } from '@/components/site/product/dashboard-render'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'How MyCampusView fits together',
  description:
    'MyCampusView keeps student records, attendance, fees, examinations, communication and transport in one database, so a change in one place is correct everywhere else.',
  alternates: { canonical: '/product' },
}

export default function ProductPage() {
  return (
    <>
      <PageIntro
        eyebrow="Product"
        title="One database, not seven integrations."
        lead="Most school software is a set of products that talk to each other on a schedule. MyCampusView is one application over one database, which is why a child admitted this morning appears on this afternoon's register without anyone copying anything."
      />

      <Section>
        <Container wide>
          <div className="screen shadow-lift">
            <DashboardRender />
          </div>
          <p className="subtle mx-auto mt-4 max-w-2xl text-center text-[14px]">
            The administrator dashboard. Figures shown are sample data for a school of about 1,300
            students.
          </p>
        </Container>
      </Section>

      <ProseSection>
        <Prose title="What integration usually means">
          <p>
            A school buys an admissions tool, a fee package and an attendance app. Each keeps its
            own copy of the student list. Somebody exports a spreadsheet on Friday to make them
            agree, and by Monday they disagree again.
          </p>
          <p>
            The cost is not the licence fees. It is the hour a week each office spends
            reconciling, and the confidence lost when two screens show different numbers in front
            of a parent.
          </p>
        </Prose>

        <Prose title="What MyCampusView does instead">
          <p>
            There is one student record. The fee module reads it, the register writes to it, the
            transport module points a bus stop at it, and the report card is generated from marks
            attached to it.
          </p>
          <p>
            Because there is nothing to synchronise, there is nothing to fall out of sync. A
            correction made in the office is the correction everyone sees.
          </p>
        </Prose>

        <Prose id="parents" title="Who sees what">
          <p>
            Everyone signs into the same system and gets a different application. A parent reaches
            their own children. A teacher marks their own classes. An accountant sees the fee
            ledger and not the medical notes.
          </p>
          <p>
            That separation is enforced when the data is read, not by hiding menu items — a link
            typed by hand returns nothing rather than someone else&rsquo;s record.
          </p>
        </Prose>
      </ProseSection>

      <Section tone="page">
        <Container>
          <Pullquote>
            Enter it once. It is right everywhere, immediately, without anybody being asked to
            keep two systems in step.
          </Pullquote>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <LinkCard
              href="/student-information-system"
              meta="Records"
              title="Students and academics"
              body="Profiles, parents, classes, attendance, homework, examinations and report cards."
            />
            <LinkCard
              href="/school-erp"
              meta="Operations"
              title="Fees, staff and communication"
              body="Fee structures, invoicing, collection, staff records, leave, notices and the school mailbox."
            />
            <LinkCard
              href="/transport"
              meta="Buses"
              title="Routes and live tracking"
              body="Fleet records, routes and stops, driver trips, boarding and parent tracking."
            />
          </div>
        </Container>
      </Section>

      <ClosingCta />
    </>
  )
}
