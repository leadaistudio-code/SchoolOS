/**
 * Proof: metrics, customer logos, stories, testimonials.
 *
 * The rule this file exists to enforce: MyCampusView does not put a number, a
 * school name or a quotation in front of a visitor unless it is real.
 *
 * The reference sites in this market lead with client counts, retention rates
 * and named testimonials. We cannot match those honestly yet, so the metrics
 * below describe the *product* — every figure is derived from the module
 * catalogue or from how the software is built, and can be checked by opening
 * the application. Nothing here is a customer statistic.
 *
 * ── Before launch ────────────────────────────────────────────────────────────
 * `PROOF_FLAGS` decides which proof sections render at all. The logo strip,
 * case studies and testimonials ship as *clearly labelled sample layouts* so
 * the design is complete and reviewable. Replace the content with verified
 * material, remove the `sample` flags, and the labels disappear. If real
 * content is not ready on the day you launch, set the flag to `false` and the
 * section is omitted entirely — an absent section costs nothing, an invented
 * one costs the sale when a director checks.
 */

import { MODULE_COUNTS } from './modules'

export const PROOF_FLAGS = {
  /** Trusted-by strip. Turn on only with written permission from each school. */
  customerLogos: false,
  /**
   * Case studies. Off: the entries below are layout, not implementations, and
   * a visitor cannot tell the difference once the sample marking is gone.
   * Turn on when a named school has approved its own write-up.
   */
  caseStudies: false,
  /**
   * Testimonials. Off for the same reason, and more sharply — a quotation
   * attributed to a principal who did not say it is the one mistake on a site
   * like this that cannot be walked back.
   */
  testimonials: false,
}

/**
 * Metrics.
 *
 * Product facts, not commercial ones. `value` is a string because some of
 * these are not numbers, and the count-up component parses what it can.
 */
export const METRICS: { value: string; label: string; note: string }[] = [
  {
    value: String(MODULE_COUNTS.available),
    label: 'Modules available today',
    note: `${MODULE_COUNTS.inBuild} more in build, ${MODULE_COUNTS.planned} planned — each labelled as such on this site.`,
  },
  {
    value: '1',
    label: 'Database behind all of them',
    note: 'A fee, an absence and a result read the same student record. Nothing is synced between systems.',
  },
  {
    value: '11',
    label: 'Roles out of the box',
    note: 'Administrator, principal, teacher, accountant, librarian, transport manager, driver, front desk, HR, parent, student — plus custom roles per school.',
  },
  {
    value: '100%',
    label: 'Of queries scoped to one school',
    note: 'Separation is enforced in the data layer and covered by tests that fail the build if a query could cross it.',
  },
]

/**
 * Customer logos.
 *
 * Deliberately empty. Add a school here only when it has agreed in writing to
 * be named, and put its mark in `public/images/customers/`.
 */
export const CUSTOMER_LOGOS: { name: string; src: string }[] = []

export type CaseStudy = {
  /** The institution. Use a description, never an invented name. */
  school: string
  location: string
  size: string
  problem: string
  approach: string
  outcome: string
  /** True until a named school has approved the write-up. */
  sample: boolean
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    school: 'A CBSE day school',
    location: 'Western India',
    size: 'Around 1,400 students',
    problem:
      'Fees were collected on a desktop accounting package, attendance on paper registers, and results in spreadsheets. Reconciling the three at the end of a term took the office most of a week.',
    approach:
      'Fee structures were rebuilt per class inside MyCampusView, two years of student history was migrated, and counter collection moved over at the start of a term.',
    outcome:
      'Outstanding fees are now a screen rather than an exercise. This is the shape a written-up implementation takes — replace it with a real one before launch.',
    sample: true,
  },
  {
    school: 'An international school',
    location: 'South India',
    size: 'Around 900 students',
    problem:
      'Parents from several countries asked for the same information by email, and the office answered each one by hand.',
    approach:
      'Parent sign-in was rolled out alongside attendance and homework, so the answer was already on the record when the question arrived.',
    outcome:
      'Routine enquiries to the front office fell. Sample layout — a real figure goes here, sourced from the school.',
    sample: true,
  },
  {
    school: 'A multi-campus group',
    location: 'Three campuses',
    size: 'Around 3,200 students across the group',
    problem:
      'Each campus ran its own software, so the group office could not see strength or collection without asking three people.',
    approach:
      'Each campus kept its own separate system inside MyCampusView, with group-level reporting reading across all three.',
    outcome:
      'The group office reads one report. Sample layout, pending a named group’s approval.',
    sample: true,
  },
]

export type Testimonial = {
  quote: string
  name: string
  role: string
  school: string
  /** True until this person has approved this wording. */
  sample: boolean
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'The change we felt first was not a feature. It was that nobody had to ask the office for a number that the system already knew.',
    name: 'Placeholder name',
    role: 'Principal',
    school: 'Sample school',
    sample: true,
  },
  {
    quote:
      'Fee collection and outstanding used to be two different answers depending on who you asked. Now there is one, and it is current.',
    name: 'Placeholder name',
    role: 'Head of accounts',
    school: 'Sample school',
    sample: true,
  },
  {
    quote:
      'Marking attendance takes the first minute of the period, and the parents who need to know have been told before the second one.',
    name: 'Placeholder name',
    role: 'Class teacher',
    school: 'Sample school',
    sample: true,
  },
]
