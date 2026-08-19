import type { ComponentProps } from 'react'
import type { Ionicons } from '@expo/vector-icons'

/**
 * The module map.
 *
 * One registry drives the tab bar, the More screen and every "can I see this"
 * decision, so navigation cannot disagree with itself. Permission keys are the
 * web application's own — `students.view`, `fees.collect` — read from
 * `/auth/me` at sign-in.
 *
 * Hiding a module here is presentation, not protection. The API enforces the
 * same permission again on every call, so a user who reaches a screen another
 * way still gets nothing they should not have. What this buys is a phone that
 * shows a teacher the four things they use rather than a wall of greyed-out
 * menu items belonging to the accounts office.
 */

export type IconName = ComponentProps<typeof Ionicons>['name']

export type Module = {
  key: string
  title: string
  /** Shown under the title on the More screen. */
  blurb: string
  href: string
  icon: IconName
  /** Visible when the user holds ANY of these. Empty means always visible. */
  permissions: string[]
  /** Grouping on the More screen. */
  group: 'People' | 'Academics' | 'Money' | 'Operations' | 'School'
  /**
   * The module's colour, used on its tile everywhere it appears.
   *
   * Assigned once here rather than chosen per screen, so a colour means a
   * module rather than decorating one — green is always attendance, blue is
   * always fees. It matches the series colours the web charts already use, so
   * somebody who reads a dashboard on a laptop and then opens the phone is
   * looking at the same language.
   */
  tint: string
  /** Built and wired to the API. The rest are listed as not yet on mobile. */
  ready: boolean
}

export const MODULES: Module[] = [
  /* ------------------------------------------------------------- people */
  { key: 'students', title: 'Students', blurb: 'Directory, profiles, attendance and fees', href: '/(app)/students', icon: 'people-outline', permissions: ['students.view'], group: 'People', tint: '#7C5CFC', ready: true },
  { key: 'admissions', title: 'Admissions', blurb: 'Enquiries, follow-ups and conversion', href: '/(app)/admissions', icon: 'person-add-outline', permissions: ['admissions.view'], group: 'People', tint: '#6366F1', ready: true },
  { key: 'parents', title: 'Parents', blurb: 'Guardians and their children', href: '/(app)/parents', icon: 'home-outline', permissions: ['parents.view'], group: 'People', tint: '#14B8A6', ready: false },
  { key: 'staff', title: 'Staff', blurb: 'Employees, leave and approvals', href: '/(app)/staff', icon: 'briefcase-outline', permissions: ['staff.view'], group: 'People', tint: '#F59E0B', ready: false },

  /* ---------------------------------------------------------- academics */
  { key: 'attendance', title: 'Attendance', blurb: 'Mark a register in a few taps', href: '/(app)/attendance', icon: 'checkbox-outline', permissions: ['attendance.view', 'attendance.mark'], group: 'Academics', tint: '#10B981', ready: true },
  { key: 'homework', title: 'Homework', blurb: 'Set work and review submissions', href: '/(app)/homework', icon: 'book-outline', permissions: ['homework.view'], group: 'Academics', tint: '#0EA5E9', ready: false },
  { key: 'timetable', title: 'Timetable', blurb: 'Today’s periods by class', href: '/(app)/timetable', icon: 'calendar-outline', permissions: ['timetable.view'], group: 'Academics', tint: '#8B5CF6', ready: false },
  { key: 'exams', title: 'Exams & results', blurb: 'Schedules, marks and report cards', href: '/(app)/exams', icon: 'school-outline', permissions: ['exams.view', 'results.view'], group: 'Academics', tint: '#F43F5E', ready: false },
  { key: 'assessments', title: 'Assessments', blurb: 'Question bank and papers', href: '/(app)/assessments', icon: 'document-text-outline', permissions: ['assessments.view', 'questionbank.view'], group: 'Academics', tint: '#C026D3', ready: false },

  /* -------------------------------------------------------------- money */
  { key: 'fees', title: 'Fees', blurb: 'Outstanding, collection and receipts', href: '/(app)/fees', icon: 'card-outline', permissions: ['fees.view'], group: 'Money', tint: '#2563EB', ready: true },

  /* --------------------------------------------------------- operations */
  { key: 'notices', title: 'Notices', blurb: 'What the school has announced', href: '/(app)/notices', icon: 'megaphone-outline', permissions: ['notices.view'], group: 'Operations', tint: '#F97316', ready: true },
  { key: 'feedback', title: 'Feedback', blurb: '360° feedback and concerns', href: '/(app)/feedback', icon: 'chatbubbles-outline', permissions: ['feedback.view', 'feedback.submit'], group: 'Operations', tint: '#EC4899', ready: false },
  { key: 'transport', title: 'Transport', blurb: 'Routes, buses and tracking', href: '/(app)/transport', icon: 'bus-outline', permissions: ['transport.view'], group: 'Operations', tint: '#06B6D4', ready: false },
  { key: 'library', title: 'Library', blurb: 'Titles and loans', href: '/(app)/library', icon: 'library-outline', permissions: ['library.view'], group: 'Operations', tint: '#65A30D', ready: false },
  { key: 'leave', title: 'Leave', blurb: 'Apply and approve', href: '/(app)/leave', icon: 'airplane-outline', permissions: ['leave.view', 'leave.apply'], group: 'Operations', tint: '#0891B2', ready: false },

  /* ------------------------------------------------------------- school */
  { key: 'reports', title: 'Reports', blurb: 'Enrolment, attendance and collection', href: '/(app)/reports', icon: 'stats-chart-outline', permissions: ['reports.view'], group: 'School', tint: '#0D9488', ready: false },
  { key: 'assistant', title: 'Assistant', blurb: 'Ask the school a question', href: '/(app)/assistant', icon: 'sparkles-outline', permissions: ['assistant.use'], group: 'School', tint: '#9333EA', ready: true },
  { key: 'settings', title: 'Settings', blurb: 'Account, school and sessions', href: '/(app)/settings', icon: 'settings-outline', permissions: [], group: 'School', tint: '#64748B', ready: true },
]

export function visibleModules(held: string[]): Module[] {
  return MODULES.filter((m) => m.permissions.length === 0 || m.permissions.some((p) => held.includes(p)))
}

/**
 * The bottom bar.
 *
 * Chosen per user rather than fixed, because "the four things you touch daily"
 * is a different four for a principal and a class teacher. Home, notices and
 * More are always present; the two slots between them go to the highest
 * priority modules the person can actually open.
 */
const TAB_PRIORITY = ['attendance', 'students', 'fees', 'admissions', 'homework', 'notices']

export function tabModules(held: string[]): Module[] {
  const allowed = visibleModules(held).filter((m) => m.ready)
  const picked: Module[] = []
  for (const key of TAB_PRIORITY) {
    if (picked.length === 2) break
    const found = allowed.find((m) => m.key === key)
    if (found) picked.push(found)
  }
  return picked
}
