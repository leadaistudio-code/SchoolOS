/**
 * The navigation tree.
 *
 * Read by the header, the mobile drawer and the footer, so a destination is
 * declared once. Every `href` here must resolve to a page that exists — the
 * site has no "coming soon" pages, and a menu that leads to a 404 costs more
 * trust than a shorter menu.
 *
 * Menus are grouped rather than listed. A director choosing software is not
 * browsing a catalogue of thirty links; they are deciding whether the thing
 * they came for is here.
 */

export type NavLink = { label: string; href: string; note?: string }

export type NavColumn = { heading: string; links: NavLink[] }

export type MegaMenu = {
  label: string
  /** Sentence shown in the menu's left rail, above the featured link. */
  lead?: string
  featured?: NavLink
  columns: NavColumn[]
}

export const MEGA_MENUS: MegaMenu[] = [
  {
    label: 'Product',
    lead: 'One system, three jobs: the record of every student, the pipeline that admits them, and the office that runs around them.',
    featured: {
      label: 'How MyCampusView fits together',
      href: '/product',
      note: 'The whole platform in one page',
    },
    columns: [
      {
        heading: 'Platform',
        links: [
          {
            label: 'Student Information System',
            href: '/student-information-system',
            note: 'One record per student',
          },
          {
            label: 'Admission CRM',
            href: '/admission-crm',
            note: 'Enquiry to enrolment',
          },
          {
            label: 'School ERP',
            href: '/school-erp',
            note: 'Fees, staff, operations',
          },
        ],
      },
      {
        heading: 'Also in the platform',
        links: [
          { label: 'Transport & tracking', href: '/transport' },
          { label: 'Parent & teacher experience', href: '/product#parents' },
          { label: 'Reports & MIS', href: '/product#reports' },
          { label: 'Integrations', href: '/integrations' },
        ],
      },
    ],
  },
  {
    label: 'Solutions',
    lead: 'The same platform, configured for how your kind of institution actually runs.',
    columns: [
      {
        heading: 'By institution',
        links: [
          { label: 'Private & K-12 schools', href: '/solutions/private-schools' },
          { label: 'International schools', href: '/solutions/international-schools' },
          { label: 'Preschools', href: '/solutions/preschools' },
          { label: 'Multi-campus groups', href: '/solutions/multi-campus' },
        ],
      },
      {
        heading: 'By concern',
        links: [
          { label: 'Replacing several systems', href: '/product' },
          { label: 'Fee collection & outstanding', href: '/school-erp#fees' },
          { label: 'Parent communication', href: '/school-erp#communication' },
          { label: 'Data migration & rollout', href: '/services' },
        ],
      },
    ],
  },
  {
    label: 'Modules',
    lead: 'Everything a school runs on, grouped the way a school is organised. Each module is labelled available, in build or planned.',
    featured: {
      label: 'The full module catalogue',
      href: '/modules',
      note: 'With what is built and what is not',
    },
    columns: [
      {
        heading: 'Academics & examinations',
        links: [
          { label: 'Classes, subjects, timetable', href: '/modules#academics' },
          { label: 'Homework & classwork', href: '/modules#academics' },
          { label: 'Marks, results, report cards', href: '/modules#examinations' },
          { label: 'Certificates', href: '/modules#examinations' },
        ],
      },
      {
        heading: 'People & admissions',
        links: [
          { label: 'Students & guardians', href: '/modules#people' },
          { label: 'Attendance & leave', href: '/modules#people' },
          { label: 'Staff records', href: '/modules#people' },
          { label: 'Enquiries & pipeline', href: '/modules#admissions' },
        ],
      },
      {
        heading: 'Finance & operations',
        links: [
          { label: 'Fees, invoices, concessions', href: '/modules#finance' },
          { label: 'Online payments', href: '/modules#finance' },
          { label: 'Transport, library, inventory', href: '/modules#operations' },
          { label: 'Reports, roles, audit trail', href: '/modules#administration' },
        ],
      },
    ],
  },
  {
    label: 'Company',
    lead: 'Who builds MyCampusView, how an implementation runs, and how your data is kept.',
    columns: [
      {
        heading: 'Company',
        links: [
          { label: 'About MyCampusView', href: '/about' },
          { label: 'Implementation & support', href: '/services' },
          { label: 'Security & data protection', href: '/security' },
          { label: 'Contact us', href: '/contact' },
        ],
      },
      {
        heading: 'Resources',
        links: [
          { label: 'Customer stories', href: '/customers' },
          { label: 'All modules', href: '/modules' },
          { label: 'Integrations', href: '/integrations' },
          { label: 'Privacy & terms', href: '/privacy' },
        ],
      },
    ],
  },
]

/** The footer. Broader than the header, because a footer is a sitemap. */
export const FOOTER_COLUMNS: NavColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Overview', href: '/product' },
      { label: 'Student Information System', href: '/student-information-system' },
      { label: 'Admission CRM', href: '/admission-crm' },
      { label: 'School ERP', href: '/school-erp' },
      { label: 'Transport', href: '/transport' },
      { label: 'Integrations', href: '/integrations' },
    ],
  },
  {
    heading: 'Modules',
    links: [
      { label: 'All modules', href: '/modules' },
      { label: 'Admissions', href: '/modules#admissions' },
      { label: 'Attendance', href: '/modules#people' },
      { label: 'Fees & finance', href: '/modules#finance' },
      { label: 'Examinations', href: '/modules#examinations' },
      { label: 'Operations', href: '/modules#operations' },
    ],
  },
  {
    heading: 'Solutions',
    links: [
      { label: 'Private & K-12 schools', href: '/solutions/private-schools' },
      { label: 'International schools', href: '/solutions/international-schools' },
      { label: 'Preschools', href: '/solutions/preschools' },
      { label: 'Multi-campus groups', href: '/solutions/multi-campus' },
      { label: 'All solutions', href: '/solutions' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Implementation & support', href: '/services' },
      { label: 'Customer stories', href: '/customers' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Security', href: '/security' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
]
