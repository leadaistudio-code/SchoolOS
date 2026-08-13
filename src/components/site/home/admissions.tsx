import * as React from 'react'
import { Container, Section } from '../container'
import { SectionHeader, StatusBadge, TextLink } from '../ui'

/**
 * Admissions.
 *
 * The honest version of a section every competitor overclaims. The pipeline,
 * follow-up reminders and conversion analytics are **not built** — they are the
 * next release — so this section shows what happens to an enquiry today, and
 * then shows the pipeline as a labelled design rather than as a screenshot of
 * software that does not exist.
 *
 * A mocked-up kanban board with invented lead names would read better and would
 * be the single most expensive sentence on the site the first time a director
 * asked to see it on a call.
 */

const TODAY: { title: string; body: string }[] = [
  {
    title: 'The enquiry is a record, not a note',
    body: 'A parent who calls or walks in is recorded against the family, with the child, the class they are asking about and where the enquiry came from.',
  },
  {
    title: 'New enquiries are on the dashboard',
    body: 'The administrator’s first screen lists the newest enquiries, so nothing sits unseen in a counsellor’s notebook until somebody asks.',
  },
  {
    title: 'Admission creates the student',
    body: 'When a child joins, the student record, the enrolment and the guardians are written in one step — and the fee structure for that class applies from the same moment.',
  },
]

const STAGES = ['Enquiry', 'Visit', 'Application', 'Offer', 'Enrolled']

export function Admissions() {
  return (
    <Section tone="page">
      <Container wide>
        <SectionHeader
          split
          eyebrow="Admissions"
          title="Every enquiry on the system from the first phone call."
          lead="Admissions is where schools lose the most information and notice it the least — a name on a notepad, a follow-up nobody owned, a family who visited twice and was never called back. SchoolOS records the enquiry today; the pipeline that works it through to enrolment is the release we are building now."
          action={<TextLink href="/admission-crm">Read about admissions</TextLink>}
        />

        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16" data-reveal>
          <div>
            <p className="eyebrow">What works today</p>
            <dl className="mt-5 space-y-6">
              {TODAY.map((item) => (
                <div key={item.title} className="border-t border-[var(--rule-strong)] pt-4">
                  <dt className="text-[16px] font-semibold text-[var(--text)]">{item.title}</dt>
                  <dd className="muted mt-2 text-[15px] leading-[1.6]">{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/*
            The pipeline, drawn as the design it currently is. The badge and the
            caption are not decoration — they are the reason this composition is
            allowed on the page at all.
          */}
          <div>
            <div className="flex items-center gap-3">
              <p className="eyebrow">The pipeline we are building</p>
              <StatusBadge status="in-build" />
            </div>

            <ol className="mt-5 space-y-2">
              {STAGES.map((stage, index) => (
                <li
                  key={stage}
                  className="flex items-center gap-4 rounded-lg border border-dashed border-[var(--rule-strong)] bg-white px-4 py-3.5"
                >
                  <span className="text-[13px] tabular-nums text-[var(--text-subtle)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[15px] font-medium text-[var(--text)]">{stage}</span>
                  <span
                    className="ml-auto h-1.5 rounded-full bg-[var(--blue-tint)]"
                    style={{ width: `${(STAGES.length - index) * 14}%` }}
                    aria-hidden
                  />
                </li>
              ))}
            </ol>

            <p className="subtle mt-5 text-[14px] leading-[1.6]">
              Drawn from the specification, not from the product. Stage-by-stage tracking,
              follow-ups with an owner and a date, counsellor assignment and conversion reporting by
              source are in build — we will tell you the same thing on a call, and show you the
              enquiry capture that does work.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  )
}
