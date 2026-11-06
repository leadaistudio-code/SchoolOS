import type { Metadata } from 'next'
import { Container, Section } from '@/components/site/container'
import { PageIntro, Prose, ProseSection, CapabilityList } from '@/components/site/page-parts'
import { ClosingCta } from '@/components/site/cta'

export const metadata: Metadata = {
  title: 'CBSE science lab and Robotics & AI lab management',
  description:
    'The CBSE composite science lab list and an Atal Tinkering Lab style Robotics & AI kit list, loaded with required quantities, a live readiness score, stock and breakage registers, practical bookings, inspections and incidents — with every register printable for an inspection.',
  alternates: { canonical: '/cbse-science-lab' },
}

export default function CbseScienceLabPage() {
  return (
    <>
      <PageIntro
        eyebrow="Add-on · Science and Robotics & AI labs"
        title="Know your lab is inspection-ready before the inspector does."
        lead="CBSE expects a composite science lab with a specified room, a specified list of apparatus, chemicals, specimens and slides for a batch of forty, and the registers to prove it. Most schools keep that in a cupboard of notebooks. MyCampusView keeps it in one place and tells you where you fall short."
      />

      <ProseSection>
        <Prose title="A readiness score, not a guess">
          <p>
            Every lab gets a score out of a hundred, built from four things CBSE looks at: the room and its fittings,
            the non-consumable apparatus, consumables and chemicals, and safety — extinguishers, first-aid kits,
            current inspections and open incidents. Each part lists exactly what is missing, and the whole report
            prints on school letterhead for the principal or an affiliation visit.
          </p>
        </Prose>

        <Prose title="The CBSE list, already loaded">
          <p>
            Creating a lab loads the CBSE item list with the quantity required for a batch of forty: glassware,
            instruments, chemicals, specimens, permanent slides and safety equipment. The lab assistant counts what is
            on the shelf once, and from then on the shortfall is calculated for you — a ready-made purchase list.
          </p>
        </Prose>

        <Prose title="Stock that keeps itself">
          <p>
            Purchases, counts, breakages and disposals go through a ledger with a running balance. When a teacher
            completes a practical, the consumables it uses are deducted automatically and any breakage is recorded
            against the student who broke it, with the amount recovered if any. Low stock and chemicals nearing
            expiry are flagged every morning.
          </p>
        </Prose>

        <Prose title="Practicals, booked against the timetable">
          <p>
            A practical library for Classes 6 to 10 comes ready to edit. Teachers book the lab against a timetable
            period; clashes with another class, the same section or the same teacher are refused. Attendance and
            record-book marks are taken in the lab, building each student&rsquo;s practical record through the year.
          </p>
        </Prose>

        <Prose title="A Robotics &amp; AI lab, too">
          <p>
            The same add-on runs a Robotics &amp; AI lab for Classes 6 to 12. Its kit list follows the Atal Tinkering
            Lab guidelines: computers, Arduino and ESP32 boards, Raspberry Pi, robot kits, motors, sensors, a 3D
            printer and soldering stations, plus components, batteries and filament as consumables. Thirty practicals
            come ready, from blinking an LED and line-following robots to image classification and PID control,
            aligned to the CBSE Artificial Intelligence and Coding curricula. Battery storage, soldering safety and
            e-waste disposal have their own checks and logs.
          </p>
        </Prose>

        <Prose title="Safety on record">
          <p>
            Daily, monthly and quarterly inspection checklists with photographs, an accident and incident register
            that alerts the principal the moment something serious is logged, and a waste disposal log. The
            display-board posters — dos and don&rsquo;ts, student rules, emergency numbers, the practical list and
            this week&rsquo;s lab timetable — print from the same data.
          </p>
        </Prose>
      </ProseSection>

      <Section tone="page">
        <Container wide>
          <CapabilityList
            groups={[
              {
                heading: 'Readiness',
                items: ['Score out of 100', 'Gaps by area', 'Infrastructure checklist', 'Printable readiness report'],
              },
              {
                heading: 'Register',
                items: ['CBSE item list with required quantities', 'Shortfall and purchase list', 'Stock ledger', 'Excel and CSV export'],
              },
              {
                heading: 'Chemicals',
                items: ['Hazard labels', 'Storage location', 'Expiry alerts', 'Safety data sheets on file'],
              },
              {
                heading: 'Practicals',
                items: ['Science (6–10) and Robotics & AI (6–12) libraries', 'Timetable-linked booking', 'Attendance and record marks', 'Automatic consumable deduction'],
              },
              {
                heading: 'Safety',
                items: ['Daily, monthly, quarterly inspections', 'Incident register with principal alert', 'Breakage per student', 'Chemical, e-waste and battery disposal log'],
              },
              {
                heading: 'Prints',
                items: ['Display-board posters', 'Stock and dead-stock registers', 'Breakage and incident registers', 'Class practical record'],
              },
            ]}
          />
        </Container>
      </Section>

      <ClosingCta />
    </>
  )
}
