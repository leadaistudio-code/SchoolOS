/**
 * The report catalogue.
 *
 * One declaration that the hub, the tab strip, the export endpoint and the
 * navigation all read, so a report cannot exist in the menu but not in the
 * exporter — or be exportable by someone who may not open it.
 */
export type ReportKey =
  | 'collection'
  | 'attendance'
  | 'academic'
  | 'enrolment'
  | 'admissions'
  | 'staff'

export type ReportDefinition = {
  key: ReportKey
  label: string
  /** Longer name used as the page title. */
  title: string
  /** What question this report answers. One sentence, no marketing. */
  summary: string
  icon: string
  href: string
  permission: string
  /** Which range the report opens on when the URL says nothing. */
  defaultDays: number
  /** The tables the CSV export offers, in the order they appear on the page. */
  exports: { key: string; label: string }[]
}

export const REPORTS: ReportDefinition[] = [
  {
    key: 'collection',
    label: 'Fee collection',
    title: 'Fee collection & arrears',
    summary: 'What was billed, what came in, what is still owed and how late it is.',
    icon: 'Wallet',
    href: '/reports/collection',
    permission: 'reports.view',
    defaultDays: 89,
    exports: [
      { key: 'class', label: 'Collection by class' },
      { key: 'head', label: 'Billing by fee head' },
      { key: 'mode', label: 'Payments by mode' },
      { key: 'ageing', label: 'Arrears ageing' },
      { key: 'defaulters', label: 'Largest balances' },
      { key: 'trend', label: 'Month by month' },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    title: 'Attendance analysis',
    summary: 'The daily line, class-by-class comparison and children below the eligibility mark.',
    icon: 'CalendarCheck',
    href: '/reports/attendance',
    permission: 'reports.view',
    defaultDays: 29,
    exports: [
      { key: 'class', label: 'Attendance by class' },
      { key: 'daily', label: 'Day by day' },
      { key: 'chronic', label: 'Below 75%' },
      { key: 'unmarked', label: 'Unmarked sections' },
    ],
  },
  {
    key: 'academic',
    label: 'Exam results',
    title: 'Exam performance',
    summary: 'Pass rates, grade spread and subject averages for one exam.',
    icon: 'GraduationCap',
    href: '/reports/academic',
    permission: 'reports.view',
    defaultDays: 89,
    exports: [
      { key: 'class', label: 'Results by class' },
      { key: 'subject', label: 'Results by subject' },
      { key: 'grades', label: 'Grade distribution' },
      { key: 'toppers', label: 'Highest scores' },
      { key: 'strugglers', label: 'Did not pass' },
    ],
  },
  {
    key: 'enrolment',
    label: 'Enrolment',
    title: 'Roll strength & demographics',
    summary: 'Headcount against capacity, the demographic split and service uptake.',
    icon: 'Users',
    href: '/reports/enrolment',
    permission: 'reports.view',
    defaultDays: 364,
    exports: [
      { key: 'class', label: 'Strength by class' },
      { key: 'demographics', label: 'Demographic split' },
      { key: 'admissions', label: 'Admissions by month' },
    ],
  },
  {
    key: 'admissions',
    label: 'Admissions funnel',
    title: 'Admissions funnel',
    summary: 'Where enquiries come from, how far they get and where they are lost.',
    icon: 'UserPlus',
    href: '/reports/admissions',
    permission: 'reports.view',
    defaultDays: 179,
    exports: [
      { key: 'funnel', label: 'Stage by stage' },
      { key: 'source', label: 'Conversion by source' },
      { key: 'owner', label: 'Conversion by owner' },
      { key: 'trend', label: 'Month by month' },
      { key: 'lost', label: 'Reasons lost' },
    ],
  },
  {
    key: 'staff',
    label: 'Staff',
    title: 'Staff attendance & leave',
    summary: 'Establishment by department, attendance against days marked, and leave taken.',
    icon: 'Briefcase',
    href: '/reports/staff',
    permission: 'reports.view',
    defaultDays: 29,
    exports: [
      { key: 'attendance', label: 'Attendance by member' },
      { key: 'leave', label: 'Leave by type' },
      { key: 'department', label: 'Headcount by department' },
    ],
  },
]

export function reportByKey(key: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.key === key)
}
