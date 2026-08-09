import { FEATURE, type FeatureKey } from '@/server/entitlements'

export type NavItem = {
  label: string
  href: string
  icon: string
  permission?: string
  feature?: FeatureKey
  children?: NavItem[]
  /** Show in the mobile bottom bar. */
  mobile?: boolean
}

/**
 * The product navigation. A single declarative tree that the sidebar, the
 * command palette, the mobile bar and the breadcrumb trail all read from, so
 * they can never disagree about what exists or who may see it.
 */
export const NAVIGATION: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: 'LayoutDashboard', permission: 'dashboard.view', mobile: true },

  {
    label: 'Students',
    href: '/students',
    icon: 'GraduationCap',
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
  { label: 'Parents', href: '/parents', icon: 'Users2', permission: 'parents.view' },
  { label: 'Teachers & Staff', href: '/staff', icon: 'Briefcase', permission: 'staff.view' },

  {
    label: 'Attendance',
    href: '/attendance',
    icon: 'CalendarCheck',
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
    permission: 'academics.view',
    children: [
      { label: 'Classes & Sections', href: '/academics/classes', icon: 'Layers', permission: 'academics.view' },
      { label: 'Subjects', href: '/academics/subjects', icon: 'BookMarked', permission: 'academics.view' },
      { label: 'Homework', href: '/academics/homework', icon: 'ClipboardList', permission: 'homework.view' },
      { label: 'Classwork', href: '/academics/classwork', icon: 'PenLine', permission: 'classwork.view' },
      { label: 'Timetable', href: '/academics/timetable', icon: 'Clock', permission: 'timetable.view' },
      { label: 'Calendar', href: '/academics/calendar', icon: 'CalendarDays', permission: 'calendar.view' },
    ],
  },
  {
    label: 'Examination',
    href: '/exams',
    icon: 'FileCheck',
    permission: 'exams.view',
    children: [
      { label: 'Exams', href: '/exams', icon: 'FileCheck', permission: 'exams.view' },
      { label: 'Marks Entry', href: '/exams/marks', icon: 'PencilRuler', permission: 'exams.marks' },
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
    label: 'Leave',
    href: '/leave',
    icon: 'CalendarOff',
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
    permission: 'notices.view',
    children: [
      { label: 'Notices', href: '/communication/notices', icon: 'Megaphone', permission: 'notices.view' },
      { label: 'Messages', href: '/communication/messages', icon: 'MessageSquare', permission: 'messages.view' },
      { label: 'Notifications', href: '/communication/notifications', icon: 'Bell' },
    ],
  },
  {
    label: 'Admissions',
    href: '/admissions',
    icon: 'UserRoundPlus',
    permission: 'admissions.view',
    feature: FEATURE.MODULE_ADMISSIONS_CRM,
    children: [
      { label: 'Lead Pipeline', href: '/admissions', icon: 'Kanban', permission: 'admissions.view' },
      { label: 'Follow-ups', href: '/admissions/followups', icon: 'PhoneCall', permission: 'admissions.manage' },
    ],
  },
  {
    label: 'Front Office',
    href: '/front-office',
    icon: 'ConciergeBell',
    permission: 'frontoffice.view',
    feature: FEATURE.MODULE_FRONT_OFFICE,
  },
  {
    label: 'Transport',
    href: '/transport',
    icon: 'Bus',
    permission: 'transport.view',
    feature: FEATURE.MODULE_TRANSPORT,
    children: [
      { label: 'Buses', href: '/transport/buses', icon: 'Bus', permission: 'transport.view' },
      { label: 'Routes & Stops', href: '/transport/routes', icon: 'Route', permission: 'transport.view' },
      { label: 'Live Tracking', href: '/transport/tracking', icon: 'MapPinned', permission: 'transport.track' },
      { label: 'Assignments', href: '/transport/assignments', icon: 'UserCheck', permission: 'transport.manage' },
    ],
  },
  { label: 'Library', href: '/library', icon: 'Library', permission: 'library.view', feature: FEATURE.MODULE_LIBRARY },
  { label: 'Inventory', href: '/inventory', icon: 'Package', permission: 'inventory.view', feature: FEATURE.MODULE_INVENTORY },
  { label: 'Sports', href: '/sports', icon: 'Medal', permission: 'sports.view', feature: FEATURE.MODULE_SPORTS },
  { label: 'Events', href: '/events', icon: 'PartyPopper', permission: 'events.view', feature: FEATURE.MODULE_EVENTS },
  { label: 'School Website', href: '/website', icon: 'Globe', permission: 'website.view', feature: FEATURE.MODULE_WEBSITE },
  { label: 'Reports', href: '/reports', icon: 'BarChart3', permission: 'reports.view' },
  {
    label: 'Settings',
    href: '/settings',
    icon: 'Settings',
    permission: 'settings.view',
    // Only built destinations are listed. The settings landing page shows the
    // remaining areas as visibly not-yet-built rather than linking to a 404.
    children: [
      { label: 'School Profile', href: '/settings', icon: 'School', permission: 'settings.view' },
      { label: 'Branding', href: '/settings/branding', icon: 'Palette', permission: 'settings.branding' },
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
