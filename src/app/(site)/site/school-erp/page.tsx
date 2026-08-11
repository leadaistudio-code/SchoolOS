import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, Prose, ProseSection, CapabilityList, Pullquote } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'Fees, staff and school operations',
  description:
    'Fee structures, invoicing, counter collection, receipts and outstanding tracking, with staff records, leave, notices and a school mailbox on the same data.',
  alternates: { canonical: '/school-erp' },
}

export default function ErpPage() {
  return (
    <>
      <PageIntro
        eyebrow="Operations"
        title="The office work, done where the records already are."
        lead="Fees, staff, leave and communication all depend on knowing who is enrolled in which class. When that lives in the same system, most of the administration disappears rather than moving."
      />

      <ProseSection>
        <Prose id="fees" title="Fees">
          <p>
            A fee structure is defined once per class and session — tuition, transport, laboratory,
            whatever the school charges — and invoices are generated from it. Because the structure
            knows the class and the class knows the student, nobody assembles a billing list.
          </p>
          <p>
            Payments are taken at the counter or recorded against an online transfer. Each one
            produces a numbered receipt, updates the outstanding figure and appears in the day&rsquo;s
            collection immediately. Part payments are allocated across invoices oldest first.
          </p>
          <p>
            Outstanding is a live view, sorted by how long money has been owed, so a follow-up
            call goes to the right family rather than the whole class.
          </p>
        </Prose>

        <Prose id="staff" title="Staff">
          <p>
            Staff records carry designation, department, contact details and joining date. Roles
            decide what each person can reach: eleven are defined for a school, from school
            administrator to driver, and each is a set of specific permissions rather than a level.
            A school can add its own.
          </p>
          <p>
            Staff attendance can be marked from a device inside a geofence around the campus, with
            the decision made on the server against coordinates held in the database.
          </p>
        </Prose>

        <Prose id="communication" title="Communication">
          <p>
            Notices go to an audience — everyone, a role, a class, a section — and appear in the
            portals of exactly those people. Internal mail runs between staff and families inside
            the system, so a conversation about a child stays on the record rather than on someone&rsquo;s
            personal phone.
          </p>
          <p>
            A school can connect its own mail server, so fee reminders and results arrive from the
            school&rsquo;s address rather than ours.
          </p>
        </Prose>
      </ProseSection>

      <Section tone="page">
        <Container wide>
          <Pullquote>
            A payment taken at 11:04 changes the outstanding figure at 11:04.
          </Pullquote>
          <div className="mt-12">
            <CapabilityList
              groups={[
                {
                  heading: 'Fee setup',
                  items: ['Fee heads', 'Structures per class and session', 'Due dates', 'Late fee rules'],
                },
                {
                  heading: 'Billing',
                  items: ['Invoice generation', 'Part payments', 'Allocation across invoices', 'Refunds', 'Cancellations'],
                },
                {
                  heading: 'Collection',
                  items: ['Counter collection', 'Numbered receipts', 'Daily collection view', 'Outstanding by class', 'Payment history'],
                },
                {
                  heading: 'Staff',
                  items: ['Staff records', 'Roles and permissions', 'Staff attendance', 'Geofenced check-in', 'Leave approval'],
                },
                {
                  heading: 'Communication',
                  // "Notification centre" was listed here and is a roadmap
                  // item — see `content/site/modules.ts`. Push notifications
                  // are not shipped, so the claim is gone rather than softened.
                  items: ['Notices by audience', 'Internal mailbox', 'Your own SMTP server'],
                },
                {
                  heading: 'Administration',
                  items: ['School profile', 'Branding and colours', 'Academic sessions', 'Audit log'],
                },
              ]}
            />
          </div>
        </Container>
      </Section>

      <ClosingCta />
    </>
  )
}
