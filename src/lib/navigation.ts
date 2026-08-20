import { FEATURE, type FeatureKey } from '@/lib/features'

export type NavSection =
  | 'MAIN'
  | 'PEOPLE'
  | 'ACADEMICS'
  | 'FINANCE'
  | 'OPERATIONS'
  | 'ENGAGEMENT'
  | 'GROWTH'
  | 'INSIGHTS'
  | 'SYSTEM'

/** Order the sidebar renders its captions in. */
export const NAV_SECTIONS: NavSection[] = [
  'MAIN',
  'PEOPLE',
  'ACADEMICS',
  'FINANCE',
  'OPERATIONS',
  'ENGAGEMENT',
  'GROWTH',
  'INSIGHTS',
  'SYSTEM',
]

export type NavItem = {
  label: string
  href: string
  icon: string
  permission?: string
  feature?: FeatureKey
  children?: NavItem[]
  /** Which captioned block of the sidebar this belongs to. Top level only. */
  section?: NavSection
  /** Show in the mobile bottom bar. */
  mobile?: boolean
  /**
   * The destination exists but the module behind it is not built yet: it
   * renders a placeholder page. Marked here so the sidebar can say so rather
   * than letting someone discover it by clicking.
   */
  soon?: boolean
}

/**
 * The product navigation. A single declarative tree that the sidebar, the
 * command palette, the mobile bar and the breadcrumb trail all read from, so
 * they can never disagree about what exists or who may see it.
 */
export const NAVIGATION: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: 'LayoutDashboard', section: 'MAIN' as const, permission: 'dashboard.view', mobile: true },

  {
    label: 'Students',
    href: '/students',
    icon: 'GraduationCap',
    section: 'PEOPLE' as const,
    permission: 'students.view',
    mobile: true,
    children: [
      { label: 'All Students', href: '/students', icon: 'Users', permission: 'students.view' },
      { label: 'Add Student', href: '/students/new', icon: 'UserPlus', permission: 'students.create' },
      { label: 'Bulk Import', href: '/students/import', icon: 'Upload', permission: 'students.import' },
      { label: 'Promotions', href: '/students/promotions', icon: 'ArrowUpRight', permission: 'students.promote' },
      { label: 'Documents', href: '/students/documents', icon: 'FolderOpen', permission: 'students.documents' },
    ],
  },
  { label: 'Parents', href: '/parents', icon: 'Users2', section: 'PEOPLE' as const, permission: 'parents.view' },
  {
    label: 'Teachers & Staff',
    href: '/staff',
    icon: 'Briefcase',
    section: 'PEOPLE' as const,
    permission: 'staff.view',
    children: [
      { label: 'Directory', href: '/staff', icon: 'Users', permission: 'staff.view' },
      { label: 'Add staff', href: '/staff/new', icon: 'UserPlus', permission: 'staff.create' },
      { label: 'Payroll', href: '/staff/payroll', icon: 'Wallet', permission: 'staff.payroll' },
      { label: 'Appraisals', href: '/staff/appraisals', icon: 'ClipboardCheck', permission: 'staff.view' },
      { label: 'Approvals', href: '/staff/approvals', icon: 'CheckCheck', permission: 'leave.view' },
    ],
  },

  {
    label: 'Attendance',
    href: '/attendance',
    icon: 'CalendarCheck',
    section: 'ACADEMICS' as const,
    permission: 'attendance.view',
    mobile: true,
    children: [
      { label: 'Student Attendance', href: '/attendance', icon: 'CalendarCheck', permission: 'attendance.view' },
      { label: 'Staff Attendance', href: '/attendance/staff', icon: 'Fingerprint', permission: 'staff_attendance.view' },
      { label: 'My Attendance', href: '/attendance/me', icon: 'MapPin', permission: 'staff_attendance.mark' },
      { label: 'Reports', href: '/attendance/reports', icon: 'BarChart3', permission: 'attendance.report' },
    ],
  },
  {
    label: 'Academics',
    href: '/academics',
    icon: 'BookOpen',
    section: 'ACADEMICS' as const,
    permission: 'academics.view',
    children: [
      { label: 'Classes & Sections', href: '/academics/classes', icon: 'Layers', permission: 'academics.view' },
      { label: 'Subjects', href: '/academics/subjects', icon: 'BookMarked', permission: 'academics.view' },
      { label: 'Syllabus', href: '/academics/curriculum', icon: 'ListTree', permission: 'curriculum.view' },
      { label: 'Homework', href: '/academics/homework', icon: 'ClipboardList', permission: 'homework.view' },
      { label: 'Classwork', href: '/academics/classwork', icon: 'PenLine', permission: 'classwork.view' },
      { label: 'Timetable', href: '/academics/timetable', icon: 'Clock', permission: 'timetable.view' },
      { label: 'Calendar', href: '/academics/calendar', icon: 'CalendarDays', permission: 'calendar.view' },
    ],
  },
  {
    label: 'My Assessments',
    href: '/my/assessments',
    icon: 'ClipboardCheck',
    section: 'ACADEMICS' as const,
    permission: 'assessments.attempt',
    mobile: true,
  },
  {
    label: 'Assessments',
    href: '/assessments',
    icon: 'FilePlus2',
    section: 'ACADEMICS' as const,
    permission: 'assessments.view',
    children: [
      { label: 'Question Papers', href: '/assessments', icon: 'FileText', permission: 'assessments.view' },
      { label: 'Question Bank', href: '/assessments/bank', icon: 'Library', permission: 'questionbank.view' },
    ],
  },
  {
    label: 'Examination',
    href: '/exams',
    icon: 'FileCheck',
    section: 'ACADEMICS' as const,
    permission: 'exams.view',
    children: [
      { label: 'Exams', href: '/exams', icon: 'FileCheck', permission: 'exams.view' },
      { label: 'Marks Entry', href: '/exams/marks', icon: 'PencilRuler', permission: 'exams.marks' },
      { label: 'Grading Scales', href: '/exams/grades', icon: 'Scale', permission: 'exams.manage' },
      { label: 'Results', href: '/exams/results', icon: 'Trophy', permission: 'results.view' },
      { label: 'Report Cards', href: '/exams/report-cards', icon: 'FileText', permission: 'results.view' },
      {
        label: 'Certificates',
        href: '/exams/certificates',
        icon: 'Award',
        permission: 'certificates.view',
        feature: FEATURE.MODULE_CERTIFICATES,
      },
    ],
  },
  {
    label: 'Finance',
    href: '/finance',
    icon: 'Wallet',
    section: 'FINANCE' as const,
    permission: 'fees.view',
    mobile: true,
    children: [
      { label: 'Overview', href: '/finance', icon: 'LayoutDashboard', permission: 'fees.view' },
      { label: 'Fee Structure', href: '/finance/structures', icon: 'ListTree', permission: 'fees.structure' },
      { label: 'Invoices', href: '/finance/invoices', icon: 'ReceiptText', permission: 'fees.view' },
      { label: 'Collect Payment', href: '/finance/collect', icon: 'BadgeIndianRupee', permission: 'fees.collect' },
      { label: 'Payments', href: '/finance/payments', icon: 'CreditCard', permission: 'fees.view' },
      { label: 'Outstanding', href: '/finance/outstanding', icon: 'AlertCircle', permission: 'fees.view' },
      { label: 'Concessions', href: '/finance/concessions', icon: 'Percent', permission: 'fees.concession' },
    ],
  },
  {
    label: 'Feedback',
    href: '/feedback',
    icon: 'MessageSquareHeart',
    section: 'ENGAGEMENT' as const,
    permission: 'feedback.view',
    children: [
      { label: 'Overview', href: '/feedback', icon: 'LayoutDashboard', permission: 'feedback.view' },
      { label: 'My feedback', href: '/feedback/mine', icon: 'ChartNoAxesCombined', permission: 'feedback.teacher_view_own' },
      { label: 'Give student feedback', href: '/feedback/students', icon: 'MessageSquarePlus', permission: 'feedback.teacher_give_student' },
      { label: 'Campaigns', href: '/feedback/campaigns', icon: 'Send', permission: 'feedback.campaign_manage' },
      { label: 'Templates', href: '/feedback/templates', icon: 'ListChecks', permission: 'feedback.template_manage' },
      { label: 'Moderation', href: '/feedback/moderation', icon: 'ShieldCheck', permission: 'feedback.moderate' },
      { label: 'Confidential concerns', href: '/feedback/concerns', icon: 'ShieldAlert', permission: 'feedback.concern_view' },
      { label: 'Action items', href: '/feedback/actions', icon: 'ListTodo', permission: 'feedback.action_manage' },
    ],
  },
  {
    label: 'Leave',
    href: '/leave',
    icon: 'CalendarOff',
    section: 'PEOPLE' as const,
    permission: 'leave.view',
    children: [
      { label: 'Leave Requests', href: '/leave', icon: 'CalendarOff', permission: 'leave.view' },
      { label: 'Apply for Leave', href: '/leave/apply', icon: 'FilePlus2', permission: 'leave.apply' },
    ],
  },
  {
    label: 'Communication',
    href: '/communication',
    icon: 'MessageSquare',
    section: 'ENGAGEMENT' as const,
    permission: 'notices.view',
    children: [
      { label: 'Notices', href: '/communication/notices', icon: 'Megaphone', permission: 'notices.view' },
      { label: 'Messages', href: '/communication/messages', icon: 'MessageSquare', permission: 'messages.view' },
      { label: 'Notifications', href: '/communication/notifications', soon: true, icon: 'Bell' },
    ],
  },
  {
    label: 'Admissions',
    href: '/admissions',
    icon: 'UserRoundPlus',
    section: 'GROWTH' as const,
    permission: 'admissions.view',
    feature: FEATURE.MODULE_ADMISSIONS_CRM,
    children: [
      { label: 'Lead Pipeline', href: '/admissions', icon: 'Kanban', permission: 'admissions.view' },
      { label: 'Follow-ups', href: '/admissions/followups', icon: 'PhoneCall', permission: 'admissions.manage' },
      { label: 'Analytics', href: '/admissions/analytics', icon: 'BarChart3', permission: 'admissions.view' },
    ],
  },
  {
    label: 'Front Office',
    href: '/front-office',
    icon: 'ConciergeBell',
    section: 'GROWTH' as const,
    permission: 'frontoffice.view',
    feature: FEATURE.MODULE_FRONT_OFFICE,
  },
  {
    label: 'Transport',
    href: '/transport',
    icon: 'Bus',
    section: 'OPERATIONS' as const,
    permission: 'transport.view',
    feature: FEATURE.MODULE_TRANSPORT,
    children: [
      { label: 'Buses', href: '/transport/buses', icon: 'Bus', permission: 'transport.view' },
      { label: 'Routes & Stops', href: '/transport/routes', icon: 'Route', permission: 'transport.view' },
      { label: 'Live Tracking', href: '/transport/tracking', icon: 'MapPinned', permission: 'transport.track' },
      { label: 'Assignments', href: '/transport/assignments', icon: 'UserCheck', permission: 'transport.manage' },
    ],
  },
  { label: 'Library', href: '/library', icon: 'Library', section: 'OPERATIONS' as const, permission: 'library.view', feature: FEATURE.MODULE_LIBRARY },
  { label: 'Inventory', href: '/inventory', icon: 'Package', section: 'OPERATIONS' as const, permission: 'inventory.view', feature: FEATURE.MODULE_INVENTORY },
  { label: 'Sports', href: '/sports', icon: 'Medal', section: 'OPERATIONS' as const, permission: 'sports.view', feature: FEATURE.MODULE_SPORTS },
  { label: 'Events', href: '/events', icon: 'PartyPopper', section: 'OPERATIONS' as const, permission: 'events.view', feature: FEATURE.MODULE_EVENTS },
  { label: 'School Website', href: '/website', icon: 'Globe', section: 'ENGAGEMENT' as const, permission: 'website.view', feature: FEATURE.MODULE_WEBSITE },
  {
    label: 'Reports',
    href: '/reports',
    icon: 'BarChart3',
    section: 'INSIGHTS' as const,
    permission: 'reports.view',
    children: [
      { label: 'Overview', href: '/reports', icon: 'LayoutDashboard', permission: 'reports.view' },
      { label: 'Fee collection', href: '/reports/collection', icon: 'Wallet', permission: 'reports.view' },
      { label: 'Attendance', href: '/reports/attendance', icon: 'CalendarCheck', permission: 'reports.view' },
      { label: 'Exam results', href: '/reports/academic', icon: 'GraduationCap', permission: 'reports.view' },
      { label: 'Enrolment', href: '/reports/enrolment', icon: 'Users', permission: 'reports.view' },
      { label: 'Admissions funnel', href: '/reports/admissions', icon: 'UserPlus', permission: 'reports.view' },
      { label: 'Staff', href: '/reports/staff', icon: 'Briefcase', permission: 'reports.view' },
    ],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: 'Settings',
    section: 'SYSTEM' as const,
    permission: 'settings.view',
    // Only built destinations are listed. The settings landing page shows the
    // remaining areas as visibly not-yet-built rather than linking to a 404.
    children: [
      { label: 'School Profile', href: '/settings', icon: 'School', permission: 'settings.view' },
      { label: 'Branding', href: '/settings/branding', icon: 'Palette', permission: 'settings.branding' },
      { label: 'Security', href: '/settings/security', icon: 'ShieldCheck', permission: 'settings.view' },
      { label: 'Custom Domains', href: '/settings/domains', icon: 'Globe', permission: 'settings.manage' },
      { label: 'Message templates', href: '/settings/templates', icon: 'FileText', permission: 'settings.manage' },
      { label: 'Email', href: '/settings/email', icon: 'Mail', permission: 'settings.manage' },
      { label: 'Help & Support', href: '/help/tickets', icon: 'LifeBuoy', permission: 'support.view' },
    ],
  },
]

export type NavPredicate = {
  can: (permission: string) => boolean
  hasFeature: (feature: FeatureKey) => boolean
}

/** Filters the tree down to what this user may actually reach. */
export function visibleNavigation(items: NavItem[], p: NavPredicate): NavItem[] {
  const out: NavItem[] = []
  for (const item of items) {
    if (item.feature && !p.hasFeature(item.feature)) continue
    if (item.permission && !p.can(item.permission)) continue
    const children = item.children ? visibleNavigation(item.children, p) : undefined
    if (item.children && (!children || children.length === 0)) continue
    out.push({ ...item, children })
  }
  return out
}

/** Flattened list used by global search and the command palette. */
export function flattenNavigation(items: NavItem[]): NavItem[] {
  return items.flatMap((i) => [i, ...(i.children ? flattenNavigation(i.children) : [])])
}
