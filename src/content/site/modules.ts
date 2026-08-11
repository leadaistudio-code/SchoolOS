/**
 * The module catalogue.
 *
 * This file is the website's single source of truth for what SchoolOS can be
 * said to do, and it is written against the application rather than against a
 * wish list.
 *
 *   available    the screen exists and works
 *   in-build     partially shipped, or shipped behind a per-school setup step
 *   planned      on the roadmap and nothing more
 *
 * How to check an entry before you change it: open `src/app/(app)/<route>`. If
 * the page renders `ModulePlaceholder`, the module is **not** available — that
 * component is the application's own way of saying "not built yet", and it
 * carries the roadmap phase that owns it. Run this to see the current list:
 *
 *   grep -rl ModulePlaceholder "src/app/(app)"
 *
 * The site never renders a `planned` module as though it existed: the badge is
 * part of the card, not an option on it. This is not caution for its own sake.
 * A director who is shown a module on a call that turns out to be a roadmap
 * item does not buy the ones that are real.
 */

export type ModuleStatus = 'available' | 'in-build' | 'planned'

export type SiteModule = {
  name: string
  /** One sentence, concrete. What the screen does, not why it matters. */
  blurb: string
  status: ModuleStatus
  /** Where it lives in the application, for whoever maintains this file. */
  route?: string
  /** The public page that covers it in depth, if there is one. */
  href?: string
}

export type ModuleCategory = {
  key: string
  label: string
  /** Why these belong together, shown above the list. */
  lead: string
  modules: SiteModule[]
}

export const MODULE_CATEGORIES: ModuleCategory[] = [
  {
    key: 'academics',
    label: 'Academics',
    lead: 'Classes, subjects and the timetable are the spine everything else hangs from — attendance, homework and results all resolve against them.',
    modules: [
      {
        name: 'Classes & sections',
        blurb: 'Class and section structure per academic year, with teachers and students assigned to each.',
        status: 'available',
        route: '/academics/classes',
      },
      {
        name: 'Subjects',
        blurb: 'Subject lists per class, including electives and the teacher who takes each one.',
        status: 'available',
        route: '/academics/subjects',
      },
      {
        name: 'Timetable',
        blurb: 'Period-by-period timetable per section, visible to teachers, students and parents.',
        status: 'available',
        route: '/academics/timetable',
      },
      {
        name: 'Homework',
        blurb: 'Homework set per subject with due dates, visible to parents the same evening.',
        status: 'available',
        route: '/academics/homework',
      },
      {
        name: 'Classwork',
        blurb: 'A record of what was covered in each period, so a returning student can catch up.',
        status: 'available',
        route: '/academics/classwork',
      },
      {
        name: 'Academic calendar',
        blurb: 'Terms, holidays and examination windows in one calendar the whole school reads.',
        status: 'available',
        route: '/academics/calendar',
      },
    ],
  },
  {
    key: 'examinations',
    label: 'Examinations',
    lead: 'Marks entered once produce the result and the report card, with the grading scheme applied centrally rather than in each teacher’s spreadsheet.',
    modules: [
      {
        name: 'Examinations',
        blurb: 'Examination schedules per class with subjects, maximum marks and dates.',
        status: 'available',
        route: '/exams',
      },
      {
        name: 'Mark entry',
        blurb: 'Subject teachers enter marks against their own classes and nobody else’s.',
        status: 'available',
        route: '/exams/[id]',
      },
      {
        name: 'Grading schemes',
        blurb: 'Grade bands defined once and applied to every result computed from them.',
        status: 'available',
        route: '/exams/grades',
      },
      {
        name: 'Results',
        blurb: 'Results computed from entered marks, held until an administrator publishes them.',
        status: 'available',
        route: '/exams/results',
      },
      {
        name: 'Report cards',
        blurb: 'Printable report cards generated from published results, per student or per section.',
        status: 'available',
        route: '/exams/report-cards',
      },
      {
        name: 'Certificates',
        blurb: 'Bonafide, transfer and character certificates issued from the student record.',
        status: 'planned',
        route: '/exams/certificates',
      },
    ],
  },
  {
    key: 'people',
    label: 'People',
    lead: 'One record per student and one per staff member. Everything else in the system points at these rather than keeping its own copy.',
    modules: [
      {
        name: 'Student records',
        blurb: 'Admission details, guardians, class history, attendance, fees and results on one record.',
        status: 'available',
        route: '/students',
        href: '/student-information-system',
      },
      {
        name: 'Parents & guardians',
        blurb: 'Guardian records linked to their children, with their own sign-in and their own view.',
        status: 'available',
        route: '/parents',
      },
      {
        name: 'Staff records',
        blurb: 'Teaching and non-teaching staff, with roles, subjects and the classes they take.',
        status: 'available',
        route: '/staff',
      },
      {
        name: 'Student attendance',
        blurb: 'Daily and period attendance, marked by the teacher who took the class.',
        status: 'available',
        route: '/attendance',
      },
      {
        name: 'Attendance reports',
        blurb: 'Attendance by class, by student and by date range, read from live records.',
        status: 'available',
        route: '/attendance/reports',
      },
      {
        name: 'Staff attendance',
        blurb: 'Attendance for employees, reported alongside leave.',
        status: 'available',
        route: '/attendance/staff',
      },
      {
        name: 'Leave',
        blurb: 'Leave applications and approvals for staff, with balances against the year.',
        status: 'available',
        route: '/leave',
      },
      {
        name: 'Document vault',
        blurb: 'Birth certificates, transfer certificates and photographs held against the student record.',
        status: 'planned',
        route: '/students/documents',
      },
      {
        name: 'Bulk import & promotions',
        blurb: 'Importing a year group from a spreadsheet, and promoting a class at year end.',
        status: 'planned',
        route: '/students/import',
      },
      {
        name: 'HR & payroll',
        blurb: 'Salary structures, deductions and payslips computed from attendance and leave.',
        status: 'planned',
      },
    ],
  },
  {
    key: 'admissions',
    label: 'Admissions',
    lead: 'Enquiries arrive on the system rather than in a notebook. The pipeline that works them through to enrolment is the next release.',
    modules: [
      {
        name: 'Enquiry capture',
        blurb: 'Enquiries recorded with the family behind them and shown on the administrator’s dashboard.',
        status: 'in-build',
        route: '/admissions',
        href: '/admission-crm',
      },
      {
        name: 'Admission pipeline',
        blurb: 'Enquiry, visit, application, offer, enrolled — the stage held on the record.',
        status: 'planned',
        route: '/admissions',
        href: '/admission-crm',
      },
      {
        name: 'Follow-ups & call logs',
        blurb: 'Scheduled follow-ups per enquiry, listed by who owes the call and when.',
        status: 'planned',
        route: '/admissions/followups',
      },
      {
        name: 'Conversion analytics',
        blurb: 'Enquiry-to-enrolment conversion by source, counsellor and stage.',
        status: 'planned',
      },
      {
        name: 'Online application forms',
        blurb: 'A public application form, with documents, that writes straight into the pipeline.',
        status: 'planned',
      },
      {
        name: 'Front office & visitors',
        blurb: 'Visitors, calls and gate passes logged at the desk they arrive at.',
        status: 'planned',
        route: '/front-office',
      },
      {
        name: 'Enrol as a student',
        blurb: 'Creating the student record directly, which is how admissions are enrolled today.',
        status: 'available',
        route: '/students/new',
      },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    lead: 'Fee structures are defined once per class and produce every invoice, receipt and outstanding report from the same figures.',
    modules: [
      {
        name: 'Fee structures',
        blurb: 'Heads, instalments and due dates per class, with the year built from them.',
        status: 'available',
        route: '/finance/structures',
      },
      {
        name: 'Invoices',
        blurb: 'Invoices raised per student from the structure that applies to their class.',
        status: 'available',
        route: '/finance/invoices',
      },
      {
        name: 'Fee collection',
        blurb: 'Counter collection with a numbered receipt, in cash, cheque or online, against the invoice.',
        status: 'available',
        route: '/finance/collect',
      },
      {
        name: 'Payments ledger',
        blurb: 'Every payment taken, searchable, with the invoice and the person who took it.',
        status: 'available',
        route: '/finance/payments',
      },
      {
        name: 'Outstanding',
        blurb: 'What is due, by class and by family, as of today rather than as of the last export.',
        status: 'available',
        route: '/finance/outstanding',
      },
      {
        name: 'Online payments',
        blurb: 'Parents pay from their own sign-in. The flow is built; your gateway account is connected at setup.',
        status: 'in-build',
        route: '/finance/pay-now',
      },
      {
        name: 'Concessions',
        blurb: 'Sibling, staff and scholarship concessions applied to the record, not to the receipt.',
        status: 'planned',
        route: '/finance/concessions',
      },
      {
        name: 'Accounting ledgers',
        blurb: 'Double-entry ledgers, vouchers and a trial balance inside SchoolOS.',
        status: 'planned',
      },
    ],
  },
  {
    key: 'communication',
    label: 'Communication',
    lead: 'One place to reach a class, a section or a whole school — addressed from the same records that hold the numbers.',
    modules: [
      {
        name: 'Notices',
        blurb: 'Notices published to chosen roles, classes or the whole school.',
        status: 'available',
        route: '/communication/notices',
      },
      {
        name: 'Messages',
        blurb: 'Direct messages between staff and parents, kept where the conversation belongs.',
        status: 'available',
        route: '/communication/messages',
      },
      {
        name: 'Email delivery',
        blurb: 'Outgoing mail through the school’s own mailbox, so it arrives from your address.',
        status: 'available',
        route: '/settings/email',
      },
      {
        name: 'Push notifications',
        blurb: 'Notifications for attendance, fees, results and announcements.',
        status: 'planned',
        route: '/communication/notifications',
      },
      {
        name: 'SMS & WhatsApp',
        blurb: 'The delivery pipeline and metering are built; a vendor account is connected per school.',
        status: 'in-build',
      },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    lead: 'The parts of a school that are not academic and still run on records: buses first, because that is where a parent’s attention is.',
    modules: [
      {
        name: 'Transport routes & stops',
        blurb: 'Routes with their stops and timings, and the students assigned to each.',
        status: 'available',
        route: '/transport/routes',
        href: '/transport',
      },
      {
        name: 'Buses & drivers',
        blurb: 'The fleet, with the driver and attendant on each vehicle.',
        status: 'available',
        route: '/transport/buses',
        href: '/transport',
      },
      {
        name: 'Live tracking',
        blurb: 'Vehicle position on a map while a route is running.',
        status: 'available',
        route: '/transport/tracking',
        href: '/transport',
      },
      {
        name: 'Library',
        blurb: 'Catalogue, issues and returns against the same student records.',
        status: 'planned',
        route: '/library',
      },
      {
        name: 'Inventory',
        blurb: 'Stock, issues and consumption for uniforms, books and school supplies.',
        status: 'planned',
        route: '/inventory',
      },
      {
        name: 'Events',
        blurb: 'School events with the audience they concern and their place in the calendar.',
        status: 'planned',
        route: '/events',
      },
      {
        name: 'Sports',
        blurb: 'Teams, fixtures and participation recorded per student.',
        status: 'planned',
        route: '/sports',
      },
      {
        name: 'School website',
        blurb: 'A public site for the school, editable by the school, on its own domain.',
        status: 'planned',
        route: '/website',
      },
      {
        name: 'Hostel',
        blurb: 'Rooms, allotment and hostel attendance for residential schools.',
        status: 'planned',
      },
      {
        name: 'Alumni',
        blurb: 'Alumni records carried forward from the student record after they leave.',
        status: 'planned',
      },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    lead: 'What a principal or a group office needs: roles, branding, an audit trail, and the dashboard that reads across the school.',
    modules: [
      {
        name: 'Administrator dashboard',
        blurb: 'Strength, attendance today, collection this month and outstanding, on one screen.',
        status: 'available',
        route: '/',
      },
      {
        name: 'Roles & permissions',
        blurb: 'Built-in roles plus custom ones, permission by permission, per school.',
        status: 'available',
        route: '/settings',
      },
      {
        name: 'Branding',
        blurb: 'The school’s name, logo and colours through the application and its documents.',
        status: 'available',
        route: '/settings/branding',
      },
      {
        name: 'Audit trail',
        blurb: 'Who did what and when, for fee collection, result publication and permission changes.',
        status: 'available',
        route: '/settings',
      },
      {
        name: 'Custom domain',
        blurb: 'The application on a domain the school owns, with certificates handled for you.',
        status: 'available',
        route: '/settings',
      },
      {
        name: 'Report builder & MIS',
        blurb: 'Saved, exportable reporting beyond the dashboard and the module reports.',
        status: 'planned',
        route: '/reports',
      },
      {
        name: 'Multi-campus consolidation',
        blurb: 'Each campus separate, with group-level reporting across all of them.',
        status: 'in-build',
        href: '/solutions/multi-campus',
      },
    ],
  },
]

export const ALL_MODULES: SiteModule[] = MODULE_CATEGORIES.flatMap((c) => c.modules)

export const MODULE_COUNTS = {
  available: ALL_MODULES.filter((m) => m.status === 'available').length,
  inBuild: ALL_MODULES.filter((m) => m.status === 'in-build').length,
  planned: ALL_MODULES.filter((m) => m.status === 'planned').length,
  total: ALL_MODULES.length,
}

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  available: 'Available',
  'in-build': 'In build',
  planned: 'Planned',
}

export const STATUS_NOTE: Record<ModuleStatus, string> = {
  available: 'Working today. We will show it to you on a call.',
  'in-build':
    'Partly shipped, or shipped and connected to your own vendor account during implementation.',
  planned: 'On the roadmap, not available today. We will tell you the same thing on a call.',
}
