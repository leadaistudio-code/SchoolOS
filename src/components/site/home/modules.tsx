import * as React from 'react'
import { Container, Section } from '../container'

/**
 * What the product actually contains.
 *
 * An honest inventory rather than a wall of eighty icon tiles. Two things make
 * it worth reading: the modules are grouped the way a school is organised
 * (office, classroom, money, buses) rather than by software category, and the
 * list is limited to what is built.
 *
 * What is not built yet is named at the bottom, quietly and without a badge on
 * every line. A school that books a demo on the strength of this page will see
 * exactly what it says.
 */

const AVAILABLE: { area: string; blurb: string; items: string[] }[] = [
  {
    area: 'The office',
    blurb: 'The records everything else reads from.',
    items: [
      'Student profiles and history',
      'Parents and guardians',
      'Classes and sections',
      'Staff records',
      'Roles and permissions',
      'Audit log',
      'School branding',
    ],
  },
  {
    area: 'The classroom',
    blurb: 'What teachers touch daily.',
    items: [
      'Attendance registers',
      'Timetable',
      'Subjects',
      'Homework',
      'Classwork',
      'Academic calendar',
      'Leave requests',
    ],
  },
  {
    area: 'Examinations',
    blurb: 'From marks entry to a printed report card.',
    items: [
      'Exam scheduling',
      'Marks entry with validation',
      'Grading scales',
      'Results and ranking',
      'Report cards',
    ],
  },
  {
    area: 'Money',
    blurb: 'Billed, collected and reconciled in one place.',
    items: [
      'Fee structures',
      'Invoice generation',
      'Counter collection',
      'Payments and receipts',
      'Outstanding by class',
      'Refunds',
    ],
  },
  {
    area: 'Buses',
    blurb: 'Fleet, routes and the children on them.',
    items: [
      'Buses and documents',
      'Routes and stops',
      'Student assignments',
      'Driver trip console',
      'Live tracking',
      'Boarding records',
    ],
  },
  {
    area: 'Communication',
    blurb: 'Reaching families without personal phone numbers.',
    items: [
      'Notices by audience',
      'Internal mailbox',
      'Notifications',
      "Your school's own mail server",
      'Parent and staff portals',
    ],
  },
]

const IN_PROGRESS = [
  'Admissions CRM',
  'Library circulation',
  'Inventory and assets',
  'Events and sports',
  'Front office and visitors',
  'Cross-module reporting',
  'Certificates',
  'Bulk student import',
]

export function Modules() {
  return (
    <Section tone="page" id="modules">
      <Container wide>
        <div className="max-w-2xl">
          <p className="eyebrow">What is in it</p>
          <h2 className="display mt-3 text-[clamp(2rem,4vw,2.9rem)]">
            Grouped the way a school is, not the way software is.
          </h2>
        </div>

        {/* Columns of text, separated by rules. No tiles, no icons: this is a
            list, and a list should look like one. */}
        <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
          {AVAILABLE.map((group) => (
            <div key={group.area} className="border-t border-[var(--rule-strong)] pt-5">
              <h3 className="text-[17px] font-semibold text-[var(--text)]">{group.area}</h3>
              <p className="subtle mt-1 text-[14px]">{group.blurb}</p>
              <ul className="mt-4 space-y-2">
                {group.items.map((item) => (
                  <li key={item} className="text-[15px] text-[var(--text-muted)]">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-xl border border-[var(--rule)] bg-white p-6 sm:p-8">
          <h3 className="text-[17px] font-semibold text-[var(--text)]">Being built next</h3>
          <p className="muted mt-1.5 max-w-2xl text-[15px]">
            These are on the roadmap and are not part of the product today. We would rather you
            read that here than discover it in a demonstration.
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {IN_PROGRESS.map((item) => (
              <li key={item} className="text-[15px] text-[var(--text-subtle)]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  )
}
