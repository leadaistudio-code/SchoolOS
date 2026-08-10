import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, Prose, ProseSection, CapabilityList } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'Student records and academics',
  description:
    'Student profiles, guardians, classes and sections, attendance, homework, examinations, results and report cards — all attached to one student record.',
  alternates: { canonical: '/student-information-system' },
}

export default function SisPage() {
  return (
    <>
      <PageIntro
        eyebrow="Student records"
        title="Everything about a student, in one place, for as long as they are with you."
        lead="A student record is not a form. It is six years of attendance, marks, fees, documents and correspondence — and it should still make sense when the child leaves."
      />

      <ProseSection>
        <Prose title="Profiles and families">
          <p>
            Each student carries their admission number, class and section, guardians, contact
            details, medical notes and documents. Guardians are people, not fields: one parent can
            have two children in different classes and sees both from one account.
          </p>
          <p>
            Sibling relationships are real relationships in the data, which is what makes a
            family-level fee view or a single notice to one household possible later.
          </p>
        </Prose>

        <Prose title="Attendance that reflects the room">
          <p>
            Teachers mark a register per class, per day, on whatever device is to hand. Absence,
            late arrival, half day and approved leave are distinct states, because a school treats
            them differently.
          </p>
          <p>
            The office sees the total build up through the morning and can tell which registers
            have not been submitted, which is usually the more useful number.
          </p>
        </Prose>

        <Prose title="Examinations and results">
          <p>
            Marks are entered against a paper with a known maximum, so an impossible score is
            refused at the point of entry rather than found later. Grading scales are configured
            per school; results and ranking are computed from them, not typed.
          </p>
          <p>
            Report cards are generated from marks already recorded. Nobody assembles them by hand
            at the end of term.
          </p>
        </Prose>
      </ProseSection>

      <Section tone="page">
        <Container wide>
          <h2 className="display text-[clamp(1.75rem,3.4vw,2.4rem)]">In this part of the product</h2>
          <div className="mt-10">
            <CapabilityList
              groups={[
                {
                  heading: 'Students',
                  items: ['Profiles and admission numbers', 'Guardians and siblings', 'Documents', 'Status and history', 'Photographs'],
                },
                {
                  heading: 'Structure',
                  items: ['Academic sessions', 'Classes and sections', 'Subjects', 'Class teachers', 'Timetable'],
                },
                {
                  heading: 'Attendance',
                  items: ['Daily registers', 'Late and half day', 'Leave requests', 'Reports by class and date', 'Staff attendance'],
                },
                {
                  heading: 'Classroom',
                  items: ['Homework with due dates', 'Submissions and marking', 'Classwork records', 'Academic calendar'],
                },
                {
                  heading: 'Examinations',
                  items: ['Exam scheduling', 'Marks entry with validation', 'Grading scales', 'Results and ranking', 'Report cards'],
                },
                {
                  heading: 'Access',
                  items: ['Parent portal', 'Student portal', 'Teacher permissions', 'Audit trail'],
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
