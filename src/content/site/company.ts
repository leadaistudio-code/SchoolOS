/**
 * Positioning copy that more than one page needs: the three products, the
 * differentiators, the school types, the implementation sequence and the
 * contact details. Kept here so the homepage and the interior pages cannot
 * drift into saying different things about the same product.
 */

export const POSITIONING = {
  name: 'MyCampusView',
  promise: 'One operating system for your entire school.',
  lead: 'Admissions, student records, academics, fees, attendance, staff, parent communication and school operations run on one connected platform — not six that have to be reconciled.',
  trustLine:
    'Built for private schools, international schools, preschools and multi-campus groups.',
}

/**
 * The three products. Ordered as a school meets them: enquiry, record, office.
 *
 * `capabilities` may only list things that work today — the module catalogue in
 * `modules.ts` is the authority. Anything on the roadmap goes in `next`, which
 * the site renders under a heading that says so.
 */
export const CORE_PRODUCTS: {
  key: string
  abbr: string
  name: string
  href: string
  lead: string
  capabilities: string[]
  next: string[]
}[] = [
  {
    key: 'crm',
    abbr: 'CRM',
    name: 'Admissions & enrolment',
    href: '/admission-crm',
    lead: 'Enquiries land on the system rather than in a counsellor’s notebook, and an admitted child becomes a student record without being typed a second time.',
    capabilities: [
      'Enquiries recorded against the family',
      'New enquiries on the administrator’s dashboard',
      'Enrolment straight into student records',
      'Guardians created with the student, in one step',
    ],
    next: [
      'Stages from enquiry to enrolled',
      'Follow-ups with an owner and a date',
      'Conversion reporting by source',
      'Online application forms',
    ],
  },
  {
    key: 'sis',
    abbr: 'SIS',
    name: 'Student Information System',
    href: '/student-information-system',
    lead: 'One record per student, holding what the school knows about them — and the record every other module reads rather than keeping its own copy of.',
    capabilities: [
      'Admission details and guardians',
      'Class and section history by year',
      'Attendance, day by day and by period',
      'Marks, results and report cards',
      'Fees raised, paid and outstanding',
      'Leave and absence on the same timeline',
      'Transport route and stop',
      'Messages exchanged with the family',
    ],
    next: ['Document vault', 'Bulk import and year-end promotion', 'Certificates'],
  },
  {
    key: 'erp',
    abbr: 'ERP',
    name: 'School operations',
    href: '/school-erp',
    lead: 'The office side: fees defined once and collected at the counter, staff and leave, transport with live tracking, and a dashboard that reads today’s figures.',
    capabilities: [
      'Fee structures, invoices and receipts',
      'Outstanding by class and by family',
      'Payments ledger with who took each one',
      'Staff records, attendance and leave',
      'Transport routes, buses and live tracking',
      'Notices and messages to a class or the school',
      'Roles, permissions and an audit trail',
      'The school’s own domain and branding',
    ],
    next: ['Library and inventory', 'Payroll', 'Report builder'],
  },
]

/** Differentiators. Each one is a property of the build, not an adjective. */
export const DIFFERENTIATORS: { title: string; body: string }[] = [
  {
    title: 'One database, not an integration',
    body: 'A fee, an absence and a result all read the same student row. There is no nightly sync between an SIS and an ERP, because there are not two systems.',
  },
  {
    title: 'Built for schools, not adapted from business software',
    body: 'Academic years, sections, terms and guardians are first-class in the data model. Nothing is a repurposed customer or invoice record.',
  },
  {
    title: 'Separation enforced in the data layer',
    body: 'Every query carries the school it belongs to. It is enforced below the screens and covered by tests that fail the build if a query could cross the boundary.',
  },
  {
    title: 'Permissions by role, per school',
    body: 'Six built-in roles and custom ones, permission by permission. A parent reaches their own children; a teacher marks their own classes.',
  },
  {
    title: 'Reporting from live figures',
    body: 'Strength, attendance, collection and outstanding are read from the records as they stand, not from an export taken last night.',
  },
  {
    title: 'Ready for several campuses',
    body: 'Each campus is its own separate system with its own staff and its own data, with group-level reporting reading across them.',
  },
  {
    title: 'The school’s own domain and branding',
    body: 'The application, its documents and the school website carry the school’s name, logo and colours on a domain the school owns.',
  },
  {
    title: 'An audit trail on what matters',
    body: 'Fee collection, result publication and permission changes are written down with the person and the time.',
  },
]

/** School types. Used by the homepage tabs and the solutions index. */
export const SCHOOL_TYPES: {
  key: string
  label: string
  href: string
  lead: string
  points: string[]
}[] = [
  {
    key: 'k12',
    label: 'Private & K-12 schools',
    href: '/solutions/private-schools',
    lead: 'One campus, a long day, and an office that is asked for the same six numbers every week.',
    points: [
      'Fee structures per class, with instalments and concessions',
      'Attendance marked by the teacher who took the period',
      'CBSE-style examination sequence through to report cards',
      'Notices and messages reaching a class or the whole school',
    ],
  },
  {
    key: 'international',
    label: 'International schools',
    href: '/solutions/international-schools',
    lead: 'Families in several countries, a fee cycle in more than one currency, and parents who expect to look things up themselves.',
    points: [
      'Parent sign-in with their own view of each child',
      'Documents and admission history held against the record',
      'Communication in writing, on the record, rather than by phone',
      'Reporting a board or trustee meeting can be given directly',
    ],
  },
  {
    key: 'preschool',
    label: 'Preschools',
    href: '/solutions/preschools',
    lead: 'Small teams, young children, and parents who want to know about the day rather than the term.',
    points: [
      'Short enrolment path from enquiry to admission',
      'Daily attendance and pickup information for guardians',
      'Fees on a simple structure without an examination cycle',
      'Photographs and notices going out the same afternoon',
    ],
  },
  {
    key: 'group',
    label: 'Multi-campus groups',
    href: '/solutions/multi-campus',
    lead: 'Several schools under one trust, each with its own staff, and a group office that needs to compare them.',
    points: [
      'Each campus separate — no staff member sees another campus by accident',
      'The same fee heads and grading schemes rolled out across campuses',
      'Group-level strength, attendance and collection reporting',
      'One domain per campus, or one for the group',
    ],
  },
]

/** The implementation sequence. Weeks are ranges, not promises. */
export const JOURNEY: { step: string; title: string; body: string; when: string }[] = [
  {
    step: '01',
    title: 'Discovery',
    body: 'We go through how your school runs today — what is on paper, what is in spreadsheets, what your current software does badly. Half a day, usually with the principal and the head of accounts.',
    when: 'Week 1',
  },
  {
    step: '02',
    title: 'Configuration',
    body: 'Classes, sections, subjects, fee heads, grading schemes, roles and branding are set up as your school actually uses them, not as a default template.',
    when: 'Weeks 1–2',
  },
  {
    step: '03',
    title: 'Data migration',
    body: 'Student records, guardians, fee history and staff are brought across from whatever holds them now. We reconcile the totals with your office before anyone signs in.',
    when: 'Weeks 2–3',
  },
  {
    step: '04',
    title: 'Training',
    body: 'Separate sessions for the office, for teachers and for whoever will administer the system. Short, on your own data, and recorded so a new joiner can watch them.',
    when: 'Weeks 3–4',
  },
  {
    step: '05',
    title: 'Launch',
    body: 'Attendance and fees go live at a term boundary wherever possible. Parent sign-in is opened once the office is comfortable, not on the same day.',
    when: 'Week 4',
  },
  {
    step: '06',
    title: 'Support',
    body: 'A named contact for the first term, then ongoing support. Every release is applied for you; there is nothing for your IT team to install.',
    when: 'Ongoing',
  },
]

/**
 * Security.
 *
 * Every line here is drawn from `docs/SECURITY.md` and is a property of the
 * code, not a badge. There are no certifications and the site says so.
 */
export const SECURITY_POINTS: { title: string; body: string }[] = [
  {
    title: 'Separation between schools',
    body: 'Every query carries the school it belongs to, enforced in the data layer below the screens. Reading another school’s record by guessing its key returns nothing; passing another school’s id in a filter is overwritten with your own. Tests cover each of those cases and fail the build.',
  },
  {
    title: 'Sessions that can actually be revoked',
    body: 'Opaque session tokens with 256 bits of entropy, stored only as hashes. Not tokens that stay valid until they expire — signing a device out, or changing a password, ends those sessions immediately.',
  },
  {
    title: 'Passwords stored as bcrypt hashes',
    body: 'Hashed with bcrypt at cost 12, with a length-first policy. Nobody at MyCampusView can read a password, and support will never ask for one.',
  },
  {
    title: 'Brute force made expensive',
    body: 'Eight failed attempts lock an account for fifteen minutes, and rate limits apply per account and per address, so neither one account nor a spray across many gets far. Every attempt is recorded with its address.',
  },
  {
    title: 'Access follows the role',
    body: 'Permissions are checked in the service layer rather than by hiding a menu item. A parent reaches their own children; a teacher marks their own classes; the API refuses what the screen would have refused.',
  },
  {
    title: 'An audit trail on what matters',
    body: 'Fee collection, result publication, permission changes and administrative overrides are written down with the person and the time.',
  },
]

/**
 * What MyCampusView does *not* have. Published deliberately: a director who finds
 * this section trusts the rest of the page more, and their IT team was going to
 * ask anyway.
 */
export const SECURITY_LIMITS = [
  'We hold no security certifications — no ISO 27001, no SOC 2 — and we will not imply otherwise.',
  'Optional Postgres row-level security ships in the repository but is off by default, because switching it on without the surrounding plumbing would break queries rather than protect them.',
  'We are happy to walk your IT team through the architecture, the isolation tests and the audit log directly.',
]

/**
 * Contact details. Placeholders are marked so nobody publishes a number that
 * does not ring.
 */
export const CONTACT = {
  email: 'hello@schoolos.app',
  sales: 'sales@schoolos.app',
  /** Set to a real number before launch, or the footer omits it. */
  phone: '',
  /** Set to a real address before launch, or the footer omits it. */
  address: '',
}
